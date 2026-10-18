import "server-only";
import {
  FulfillmentStatus,
  InventoryReservationStatus,
  PaymentStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { getSiteUrl } from "@/lib/env";
import { createOrderAccessToken } from "@/lib/payment-result-token";
import {
  getYookassaPaymentUpdate,
  mapYookassaPaymentStatus,
  type YookassaPayment,
} from "@/lib/yookassa";
import {
  commitInventoryReservations,
  releaseOrderReservations,
} from "@/server/commerce/inventory";
import { enqueuePaymentSucceededNotifications } from "@/server/commerce/outbox";

type SyncPaymentOptions = {
  eventType?: string;
  eventPayload?: Prisma.InputJsonValue;
};

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

function isSerializableConflict(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown };
    message?: unknown;
  };
  const code = String(candidate.code ?? "");
  const databaseCode = String(candidate.meta?.code ?? "");
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return (
    code === "P2034" ||
    code === "40001" ||
    databaseCode === "40001" ||
    /(?:code:\s*`?40001`?|serialization failure|не удалось сериализовать)/iu.test(message)
  );
}

function orderAccessUrl(checkoutKey: string | null) {
  if (!checkoutKey) {
    return `${getSiteUrl()}/contacts`;
  }

  const access = createOrderAccessToken(checkoutKey);
  return `${getSiteUrl()}/order/${encodeURIComponent(access.token)}`;
}

function paymentEventKey(payment: YookassaPayment, eventType?: string) {
  return `yookassa:${payment.id}:${eventType ?? payment.status}`;
}

export async function syncYookassaPayment(
  prisma: PrismaClient,
  payment: YookassaPayment,
  options: SyncPaymentOptions = {}
) {
  const metadataOrderId = payment.metadata?.orderId ?? "";
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { yookassaPaymentId: payment.id },
        { paymentAttempts: { some: { providerPaymentId: payment.id } } },
        ...(metadataOrderId ? [{ id: metadataOrderId }] : []),
      ],
    },
    select: { id: true },
  });

  if (!order) {
    return null;
  }

  const runTransaction = () =>
    prisma.$transaction(
      async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`
      );

      const current = await tx.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          phone: true,
          email: true,
          checkoutKey: true,
          totalPrice: true,
          fulfillmentStatus: true,
          paymentStatus: true,
          yookassaPaymentId: true,
          paidAt: true,
          paymentAttempts: {
            where: {
              OR: [
                { providerPaymentId: payment.id },
                ...(payment.metadata?.paymentAttemptId
                  ? [{ id: payment.metadata.paymentAttemptId }]
                  : []),
              ],
            },
            orderBy: { attemptNumber: "desc" },
            take: 1,
          },
        },
      });

      if (!current) {
        return null;
      }

      const legacyUpdate = getYookassaPaymentUpdate(payment, {
        orderId: current.id,
        orderNumber: current.orderNumber,
        amountRub: current.totalPrice,
      });
      const nextStatus = mapYookassaPaymentStatus(payment.status);
      const attempt = current.paymentAttempts[0] ?? null;
      const latestAttempt = await tx.paymentAttempt.findFirst({
        where: { orderId: current.id },
        orderBy: { attemptNumber: "desc" },
        select: { id: true },
      });
      // Delayed non-success notifications only update their own attempt.
      // Success still matters for any attempt: money may have actually arrived.
      const isCurrentAttempt = latestAttempt
        ? latestAttempt.id === attempt?.id
        : current.yookassaPaymentId === payment.id;
      const wasPaid = current.paymentStatus === PaymentStatus.SUCCEEDED;
      // A delayed payment notification must never undo a completed refund.
      if (current.paymentStatus === PaymentStatus.REFUNDED) {
        if (current.yookassaPaymentId !== payment.id && nextStatus === PaymentStatus.SUCCEEDED) {
          await tx.order.update({ where: { id: current.id }, data: { requiresPaymentReview: true } });
        }
        return { id: current.id, orderNumber: current.orderNumber, paymentStatus: current.paymentStatus };
      }
      const isNewSuccessfulPayment = nextStatus === PaymentStatus.SUCCEEDED && !wasPaid;
      const isLatePaymentForCanceledOrder =
        nextStatus === PaymentStatus.SUCCEEDED &&
        current.fulfillmentStatus === FulfillmentStatus.CANCELLED;
      const isUnexpectedSecondPayment =
        nextStatus === PaymentStatus.SUCCEEDED &&
        wasPaid &&
        current.yookassaPaymentId !== payment.id;

      if (options.eventType) {
        await tx.paymentEvent.upsert({
          where: { eventKey: paymentEventKey(payment, options.eventType) },
          create: {
            orderId: current.id,
            paymentAttemptId: attempt?.id ?? null,
            eventKey: paymentEventKey(payment, options.eventType),
            eventType: options.eventType,
            providerPaymentId: payment.id,
            ...(options.eventPayload !== undefined ? { payload: options.eventPayload } : {}),
          },
          update: {},
        });
      }

      if (attempt && (attempt.status !== PaymentStatus.SUCCEEDED || nextStatus === PaymentStatus.SUCCEEDED)) {
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            providerPaymentId: payment.id,
            status: nextStatus,
            confirmationUrl: payment.confirmation?.confirmation_url ?? attempt.confirmationUrl,
            paidAt:
              nextStatus === PaymentStatus.SUCCEEDED
                ? attempt.paidAt ?? new Date()
                : attempt.paidAt,
            errorCode: null,
            errorMessage: null,
          },
        });
      }

      if (isUnexpectedSecondPayment) {
        await tx.order.update({
          where: { id: current.id },
          data: { requiresPaymentReview: true },
        });
      } else if ((!wasPaid && isCurrentAttempt) || nextStatus === PaymentStatus.SUCCEEDED) {
        await tx.order.update({
          where: { id: current.id },
          data: {
            ...legacyUpdate,
            yookassaPaymentId: payment.id,
            ...(payment.confirmation?.confirmation_url
              ? { yookassaConfirmationUrl: payment.confirmation.confirmation_url }
              : {}),
            paidAt:
              nextStatus === PaymentStatus.SUCCEEDED
                ? current.paidAt ?? new Date()
                : current.paidAt,
            ...(isLatePaymentForCanceledOrder ? { requiresPaymentReview: true } : {}),
          },
        });
      }

      if (isNewSuccessfulPayment && !isLatePaymentForCanceledOrder) {
        await commitInventoryReservations(tx, current.id);
        await enqueuePaymentSucceededNotifications(tx, {
          orderId: current.id,
          orderNumber: current.orderNumber,
          customerName: current.customerName,
          email: current.email,
          phone: current.phone,
          totalPrice: current.totalPrice,
          orderUrl: orderAccessUrl(current.checkoutKey),
        });
      } else if (nextStatus === PaymentStatus.CANCELED && !wasPaid && isCurrentAttempt) {
        await releaseOrderReservations(
          tx,
          current.id,
          InventoryReservationStatus.RELEASED
        );
      }

      if (options.eventType) {
        await tx.paymentEvent.update({
          where: { eventKey: paymentEventKey(payment, options.eventType) },
          data: { processedAt: new Date(), processingError: null },
        });
      }

      return tx.order.findUnique({
        where: { id: current.id },
        select: {
          id: true,
          orderNumber: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          requiresStockReview: true,
          requiresPaymentReview: true,
        },
      });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      }
    );

  for (let attempt = 1; attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await runTransaction();
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }

  return null;
}
