import "server-only";
import { createHash } from "node:crypto";
import {
  FulfillmentStatus,
  OrderItemKind,
  OrderStatus,
  PaymentStatus,
  Prisma,
  SeedSetRevisionRole,
  ShippingMethod,
} from "@prisma/client";
import { getSiteUrl } from "@/lib/env";
import { formatOrderNumber } from "@/lib/order-number";
import { createOrderAccessToken } from "@/lib/payment-result-token";
import { prisma } from "@/lib/prisma";
import { LEGAL_DOCUMENT_VERSION } from "@/shared/legal/version";
import {
  createYookassaPayment,
  type YookassaPaymentItem,
} from "@/lib/yookassa";
import { CommerceError } from "@/server/commerce/errors";
import {
  createInventoryReservations,
  reserveInventoryForExistingOrder,
  RESERVATION_TTL_MS,
  type InventoryRequirement,
} from "@/server/commerce/inventory";
import { enqueueOrderCreatedNotifications } from "@/server/commerce/outbox";
import { syncYookassaPayment } from "@/server/commerce/payment-sync";
import { withSerializableRetry } from "@/server/commerce/transaction-retry";
import { GIFT_WRAP_PRICE } from "@/shared/config/commerce";

const GIFT_WRAP_DESCRIPTION = "Подарочная упаковка";
const GIFT_WRAP_SERVICE_CODE = "gift_wrap";

export type CheckoutItemInput =
  | { kind: "product"; productId: string; quantity: number }
  | { kind: "seedSet"; seedSetId: string; quantity: number };

export type CheckoutInput = {
  checkoutKey: string;
  customerName: string;
  phone: string;
  phoneNormalized: string;
  email: string;
  address: string | null;
  shippingMethod: typeof ShippingMethod.SELF_PICKUP | typeof ShippingMethod.LOCAL_COURIER;
  comment: string | null;
  giftWrap: boolean;
  legalVersion: typeof LEGAL_DOCUMENT_VERSION;
  items: CheckoutItemInput[];
};

type CheckoutOrder = Awaited<ReturnType<typeof loadCheckoutOrder>>;

function canonicalCheckoutInput(input: CheckoutInput) {
  return {
    customerName: input.customerName,
    phoneNormalized: input.phoneNormalized,
    email: input.email,
    address: input.address ?? "",
    shippingMethod: input.shippingMethod,
    comment: input.comment ?? "",
    giftWrap: input.giftWrap,
    legalVersion: input.legalVersion,
    items: input.items
      .map((item) =>
        item.kind === "product"
          ? { kind: item.kind, id: item.productId, quantity: item.quantity }
          : { kind: item.kind, id: item.seedSetId, quantity: item.quantity }
      )
      .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`)),
  };
}

export function createCheckoutFingerprint(input: CheckoutInput) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalCheckoutInput(input)))
    .digest("hex");
}

export function normalizeCheckoutKey(value: string | null) {
  const key = (value ?? "").trim();
  return /^[A-Za-z0-9:_-]{16,128}$/.test(key) ? key : "";
}

async function getNextOrderNumber(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ value: bigint | number | string }[]>`
    SELECT nextval('"Order_orderNumber_seq"') AS value
  `;

  if (!row) {
    throw new Error("Order number sequence did not return a value.");
  }

  return formatOrderNumber(Number(row.value));
}

async function loadCheckoutOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      checkoutKey: true,
      checkoutFingerprint: true,
      customerName: true,
      phone: true,
      phoneNormalized: true,
      email: true,
      totalPrice: true,
      fulfillmentStatus: true,
      paymentStatus: true,
      preorderRequired: true,
      preorderConfirmedAt: true,
      createdAt: true,
      paymentResultTokenExpiresAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          productNameSnapshot: true,
          priceSnapshot: true,
          quantity: true,
          kind: true,
        },
      },
      inventoryReservations: {
        select: { expiresAt: true, status: true },
        orderBy: { expiresAt: "desc" },
      },
      paymentAttempts: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
      },
    },
  });
}

export async function findCheckoutByKey(checkoutKey: string) {
  return prisma.order.findUnique({
    where: { checkoutKey },
    select: { id: true, checkoutFingerprint: true },
  });
}

function paymentItems(order: NonNullable<CheckoutOrder>): YookassaPaymentItem[] {
  return order.items.map((item) => ({
    description: item.productNameSnapshot,
    quantity: item.quantity,
    amountRub: item.priceSnapshot,
    ...(item.kind === OrderItemKind.SERVICE
      ? { paymentSubject: "service" as const }
      : {}),
  }));
}

function checkoutResponse(order: NonNullable<CheckoutOrder>, accessToken: string) {
  const preorderPending = order.preorderRequired && !order.preorderConfirmedAt;
  const attempt = order.paymentAttempts[0] ?? null;
  const reservationExpiresAt = order.inventoryReservations.find(
    (reservation) => reservation.status === "ACTIVE"
  )?.expiresAt;

  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    paymentStatus: order.paymentStatus,
    paymentConfirmationUrl: preorderPending ? null : attempt?.confirmationUrl ?? null,
    paymentError: preorderPending ? null : attempt?.errorMessage ?? null,
    preorderPending,
    orderUrl: `/order/${encodeURIComponent(accessToken)}`,
    reservationExpiresAt: reservationExpiresAt?.toISOString() ?? null,
  };
}

async function ensurePayment(order: NonNullable<CheckoutOrder>, accessToken: string) {
  if (order.fulfillmentStatus === FulfillmentStatus.CANCELLED) {
    throw new CommerceError(409, "ORDER_CANCELLED", "Этот заказ отменён. Для новой покупки отправьте оформление ещё раз.");
  }
  if (order.paymentStatus === PaymentStatus.REFUNDED) {
    throw new CommerceError(409, "PAYMENT_NOT_RETRYABLE", "Оплата этого заказа возвращена. Для новой покупки отправьте оформление ещё раз.");
  }
  if (order.preorderRequired && !order.preorderConfirmedAt) {
    return checkoutResponse(order, accessToken);
  }
  let attempt = order.paymentAttempts[0] ?? null;

  if (!attempt) {
    attempt = await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        attemptNumber: 1,
        idempotencyKey: `checkout:${order.checkoutKey}:1`,
        amount: order.totalPrice,
      },
    });
  }

  if (
    attempt.confirmationUrl &&
    (attempt.status === PaymentStatus.PENDING ||
      attempt.status === PaymentStatus.WAITING_FOR_CAPTURE)
  ) {
    return checkoutResponse(order, accessToken);
  }

  if (attempt.status === PaymentStatus.SUCCEEDED || order.paymentStatus === PaymentStatus.SUCCEEDED) {
    return checkoutResponse(order, accessToken);
  }

  try {
    const preorderPending = await withSerializableRetry(() => prisma.$transaction(
      async (tx) => {
        await reserveInventoryForExistingOrder(
          tx,
          order.id,
          new Date(Date.now() + RESERVATION_TTL_MS)
        );
        const refreshed = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
        if (refreshed.preorderRequired && !refreshed.preorderConfirmedAt) return true;
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: PaymentStatus.PENDING, errorCode: null, errorMessage: null },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: PaymentStatus.PENDING },
        });
        return false;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      }
    ));

    if (preorderPending) {
      const refreshed = await loadCheckoutOrder(order.id);
      if (!refreshed) throw new CommerceError(404, "ORDER_NOT_FOUND", "Заказ не найден.");
      return checkoutResponse(refreshed, accessToken);
    }

    const result = await createYookassaPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentAttemptId: attempt.id,
      idempotencyKey: attempt.idempotencyKey,
      amountRub: order.totalPrice,
      returnUrl: `${getSiteUrl()}/payment/result?token=${encodeURIComponent(accessToken)}`,
      customerName: order.customerName,
      customerPhone: order.phoneNormalized,
      ...(order.email ? { customerEmail: order.email } : {}),
      items: paymentItems(order),
    });

    await syncYookassaPayment(prisma, result.payment);
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { confirmationUrl: result.confirmationUrl },
    });
  } catch (error) {
    const message =
      error instanceof CommerceError
        ? error.message
        : "Не удалось открыть страницу оплаты. Заказ сохранён — попробуйте оплатить его ещё раз.";

    await prisma.$transaction([
      prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PaymentStatus.FAILED,
          errorCode: error instanceof CommerceError ? error.code : "PAYMENT_CREATE_FAILED",
          errorMessage: message,
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: PaymentStatus.FAILED },
      }),
    ]);

    if (error instanceof CommerceError) {
      throw error;
    }
  }

  const updated = await loadCheckoutOrder(order.id);
  if (!updated) {
    throw new CommerceError(404, "ORDER_NOT_FOUND", "Заказ не найден.");
  }

  return checkoutResponse(updated, accessToken);
}

async function createCheckoutOrder(input: CheckoutInput, fingerprint: string) {
  const access = createOrderAccessToken(input.checkoutKey);
  const siteUrl = getSiteUrl();

  const createdOrderId = await withSerializableRetry(() => prisma.$transaction(
    async (tx) => {
      const productItems = input.items.filter(
        (item): item is Extract<CheckoutItemInput, { kind: "product" }> =>
          item.kind === "product"
      );
      const seedSetItems = input.items.filter(
        (item): item is Extract<CheckoutItemInput, { kind: "seedSet" }> =>
          item.kind === "seedSet"
      );
      const productIds = Array.from(new Set(productItems.map((item) => item.productId)));
      const seedSetIds = Array.from(new Set(seedSetItems.map((item) => item.seedSetId)));

      if (seedSetIds.length > 0) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "SeedSet" WHERE "id" IN (${Prisma.join(
            seedSetIds
          )}) ORDER BY "id" FOR UPDATE`
        );
      }

      const seedSetsWithRevisions = await tx.seedSet.findMany({
        where: { id: { in: seedSetIds } },
        select: {
          id: true,
          isPublished: true,
          revisions: {
            where: { role: SeedSetRevisionRole.PUBLISHED },
            take: 1,
            select: {
              name: true,
              price: true,
              imageUrl: true,
              items: {
                orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                select: { productId: true },
              },
            },
          },
        },
      });
      const seedSets = seedSetsWithRevisions.flatMap((seedSet) => {
        const revision = seedSet.revisions[0];
        return revision
          ? [
              {
                id: seedSet.id,
                isPublished: seedSet.isPublished,
                name: revision.name,
                price: revision.price,
                imageUrl: revision.imageUrl,
                items: revision.items,
              },
            ]
          : [];
      });
      const componentRows = seedSets.flatMap((seedSet) => seedSet.items);
      const allProductIds = Array.from(
        new Set([...productIds, ...componentRows.map((row) => row.productId)])
      ).sort();

      if (allProductIds.length > 0) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(
            allProductIds
          )}) ORDER BY "id" FOR UPDATE`
        );
      }

      const products = await tx.product.findMany({
        where: { id: { in: allProductIds } },
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          inventoryPolicy: true,
          mainImageUrl: true,
          isPublished: true,
        },
      });

      const productById = new Map(products.map((product) => [product.id, product]));
      const seedSetById = new Map(seedSets.map((seedSet) => [seedSet.id, seedSet]));

      for (const item of productItems) {
        const product = productById.get(item.productId);
        if (!product?.isPublished) {
          throw new CommerceError(
            400,
            "PRODUCTS_UNAVAILABLE",
            "Некоторые товары больше не доступны. Обновите корзину и попробуйте снова."
          );
        }
      }

      for (const item of seedSetItems) {
        const seedSet = seedSetById.get(item.seedSetId);
        if (!seedSet?.isPublished || seedSet.items.length === 0) {
          throw new CommerceError(
            400,
            "PRODUCTS_UNAVAILABLE",
            "Некоторые наборы больше не доступны. Обновите корзину и попробуйте снова."
          );
        }
        if (seedSet.items.some((component) => !productById.get(component.productId)?.isPublished)) {
          throw new CommerceError(
            409,
            "SET_COMPONENT_UNAVAILABLE",
            `Состав набора «${seedSet.name}» изменился. Обновите корзину.`
          );
        }
      }

      const orderItems = input.items.map((item) => {
        if (item.kind === "product") {
          const product = productById.get(item.productId)!;
          return {
            kind: OrderItemKind.PRODUCT,
            productId: product.id,
            productNameSnapshot: product.name,
            priceSnapshot: product.price,
            imageUrlSnapshot: product.mainImageUrl,
            quantity: item.quantity,
          };
        }

        const seedSet = seedSetById.get(item.seedSetId)!;
        return {
          kind: OrderItemKind.SEED_SET,
          seedSetId: seedSet.id,
          productNameSnapshot: seedSet.name,
          priceSnapshot: seedSet.price,
          imageUrlSnapshot: seedSet.imageUrl,
          quantity: item.quantity,
          components: {
            create: seedSet.items.map((component) => {
              const product = productById.get(component.productId)!;
              return {
                productId: product.id,
                productNameSnapshot: product.name,
                quantity: 1,
              };
            }),
          },
        };
      });

      const subtotalPrice = orderItems.reduce(
        (sum, item) => sum + item.priceSnapshot * item.quantity,
        0
      );
      const giftWrapPrice = input.giftWrap ? GIFT_WRAP_PRICE : 0;
      const totalPrice = subtotalPrice + giftWrapPrice;
      const orderNumber = await getNextOrderNumber(tx);
      const previousPaidOrder = await tx.order.findFirst({
        where: {
          phoneNormalized: input.phoneNormalized,
          paymentStatus: PaymentStatus.SUCCEEDED,
        },
        select: { id: true },
      });

      const order = await tx.order.create({
        data: {
          orderNumber,
          customerName: input.customerName,
          phone: input.phone,
          phoneNormalized: input.phoneNormalized,
          email: input.email,
          address: input.address,
          comment: input.comment,
          status: OrderStatus.PENDING,
          fulfillmentStatus: FulfillmentStatus.NEW,
          subtotalPrice,
          giftWrapPrice,
          shippingPrice: 0,
          shippingMethod: input.shippingMethod,
          totalPrice,
          isRepeatCustomer: Boolean(previousPaidOrder),
          checkoutKey: input.checkoutKey,
          checkoutFingerprint: fingerprint,
          paymentResultTokenHash: access.hash,
          paymentResultTokenExpiresAt: access.expiresAt,
          termsAcceptedAt: new Date(),
          legalVersion: input.legalVersion,
          items: {
            create: [
              ...orderItems,
              ...(input.giftWrap
                ? [
                    {
                      kind: OrderItemKind.SERVICE,
                      serviceCode: GIFT_WRAP_SERVICE_CODE,
                      productNameSnapshot: GIFT_WRAP_DESCRIPTION,
                      priceSnapshot: GIFT_WRAP_PRICE,
                      quantity: 1,
                    },
                  ]
                : []),
            ],
          },
          shipment: {
            create: {
              method: input.shippingMethod,
              addressSnapshot: input.address,
            },
          },
          statusHistory: {
            create: {
              to: FulfillmentStatus.NEW,
              actorType: "system",
              note: "Заказ создан",
            },
          },
        },
        select: { id: true },
      });

      const inventoryRequirements: InventoryRequirement[] = [];
      for (const item of input.items) {
        if (item.kind === "product") {
          inventoryRequirements.push({ productId: item.productId, quantity: item.quantity });
          continue;
        }

        const seedSet = seedSetById.get(item.seedSetId)!;
        for (const component of seedSet.items) {
          inventoryRequirements.push({
            productId: component.productId,
            quantity: item.quantity,
          });
        }
      }

      const reservationExpiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
      await createInventoryReservations(tx, {
        orderId: order.id,
        requirements: inventoryRequirements,
        expiresAt: reservationExpiresAt,
      });
      await tx.paymentAttempt.create({
        data: {
          orderId: order.id,
          attemptNumber: 1,
          idempotencyKey: `checkout:${input.checkoutKey}:1`,
          amount: totalPrice,
        },
      });
      await enqueueOrderCreatedNotifications(tx, {
        orderId: order.id,
        orderNumber,
        customerName: input.customerName,
        email: input.email,
        phone: input.phone,
        totalPrice,
        orderUrl: `${siteUrl}/order/${encodeURIComponent(access.token)}`,
      });

      return order.id;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 20_000,
    }
  ));

  const order = await loadCheckoutOrder(createdOrderId);
  if (!order) {
    throw new CommerceError(500, "ORDER_NOT_FOUND", "Созданный заказ не найден.");
  }

  return { order, accessToken: access.token };
}

export async function createOrResumeCheckout(input: CheckoutInput) {
  const fingerprint = createCheckoutFingerprint(input);
  const access = createOrderAccessToken(input.checkoutKey);
  let order = await prisma.order.findUnique({
    where: { checkoutKey: input.checkoutKey },
    select: { id: true, checkoutFingerprint: true },
  });

  if (order?.checkoutFingerprint && order.checkoutFingerprint !== fingerprint) {
    throw new CommerceError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "Данные оформления изменились. Повторите отправку заказа."
    );
  }

  if (!order) {
    try {
      const created = await createCheckoutOrder(input, fingerprint);
      return ensurePayment(created.order, created.accessToken);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }

      order = await prisma.order.findUnique({
        where: { checkoutKey: input.checkoutKey },
        select: { id: true, checkoutFingerprint: true },
      });
    }
  }

  if (!order) {
    throw new CommerceError(500, "CREATE_ORDER_FAILED", "Не удалось сохранить заказ.");
  }

  if (order.checkoutFingerprint && order.checkoutFingerprint !== fingerprint) {
    throw new CommerceError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "Данные оформления изменились. Повторите отправку заказа."
    );
  }

  const checkoutOrder = await loadCheckoutOrder(order.id);
  if (!checkoutOrder) {
    throw new CommerceError(404, "ORDER_NOT_FOUND", "Заказ не найден.");
  }

  return ensurePayment(checkoutOrder, access.token);
}

export async function retryOrderPayment(orderId: string, accessToken: string) {
  const current = await loadCheckoutOrder(orderId);
  if (!current) {
    throw new CommerceError(404, "ORDER_NOT_FOUND", "Заказ не найден.");
  }
  if (current.fulfillmentStatus === FulfillmentStatus.CANCELLED) {
    throw new CommerceError(
      409,
      "ORDER_CANCELLED",
      "Отменённый заказ нельзя оплатить повторно."
    );
  }
  if (current.paymentStatus === PaymentStatus.SUCCEEDED) {
    return checkoutResponse(current, accessToken);
  }
  if (current.paymentStatus === PaymentStatus.REFUNDED) {
    throw new CommerceError(
      409,
      "PAYMENT_NOT_RETRYABLE",
      "Для возвращённого платежа нужно оформить новый заказ."
    );
  }

  const latestAttempt = current.paymentAttempts[0] ?? null;
  const needsNewAttempt =
    latestAttempt &&
    (latestAttempt.status === PaymentStatus.CANCELED ||
      (latestAttempt.status === PaymentStatus.FAILED && Boolean(latestAttempt.providerPaymentId)));

  if (needsNewAttempt) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      );
      const lastAttempt = await tx.paymentAttempt.findFirst({
        where: { orderId },
        orderBy: { attemptNumber: "desc" },
      });
      if (
        lastAttempt &&
        (lastAttempt.status === PaymentStatus.CANCELED ||
          (lastAttempt.status === PaymentStatus.FAILED && Boolean(lastAttempt.providerPaymentId)))
      ) {
        const nextNumber = lastAttempt.attemptNumber + 1;
        await tx.paymentAttempt.create({
          data: {
            orderId,
            attemptNumber: nextNumber,
            idempotencyKey: `checkout:${current.checkoutKey ?? current.id}:${nextNumber}`,
            amount: current.totalPrice,
          },
        });
      }
    });
  }

  const refreshed = await loadCheckoutOrder(orderId);
  if (!refreshed) {
    throw new CommerceError(404, "ORDER_NOT_FOUND", "Заказ не найден.");
  }

  return ensurePayment(refreshed, accessToken);
}
