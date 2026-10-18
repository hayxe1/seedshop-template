import type { Prisma } from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { fulfillmentStatusSchema, ok } from "@/shared/api/contracts";

export const dynamic = "force-dynamic";

function parsePositiveInt(raw: string | null, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parseDateParam(raw: string | null) {
  const value = raw?.trim();
  if (!value) {
    return null;
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ruMatch = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  const parts = isoMatch
    ? {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
      }
    : ruMatch
      ? {
          year: Number(ruMatch[3]),
          month: Number(ruMatch[2]),
          day: Number(ruMatch[1]),
        }
      : null;

  if (!parts) {
    return null;
  }

  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  ) {
    return null;
  }

  return date;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export async function GET(request: Request) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();
    const queryNormalized = normalizePhone(query);
    const status = fulfillmentStatusSchema.safeParse(url.searchParams.get("status"));
    const dateFrom = parseDateParam(url.searchParams.get("dateFrom"));
    const dateTo = parseDateParam(url.searchParams.get("dateTo"));

    const page = Math.max(1, parsePositiveInt(url.searchParams.get("page"), 1));
    const pageSize = Math.min(100, Math.max(1, parsePositiveInt(url.searchParams.get("pageSize"), 20)));
    const skip = (page - 1) * pageSize;

    const filters: Prisma.OrderWhereInput[] = [];

    if (query.length > 0) {
      filters.push({
        OR: [
          {
            orderNumber: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            id: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            customerName: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            email: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            phone: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          ...(queryNormalized
            ? [
                {
                  phoneNormalized: {
                    contains: queryNormalized,
                  },
                },
              ]
            : []),
        ],
      });
    }

    if (status.success) {
      filters.push({ fulfillmentStatus: status.data });
    }

    if (dateFrom || dateTo) {
      filters.push({
        createdAt: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lt: addDays(dateTo, 1) } : {}),
        },
      });
    }

    const where: Prisma.OrderWhereInput | undefined =
      filters.length > 0 ? { AND: filters } : undefined;

    const [total, orders] = await Promise.all([
      prisma.order.count({ ...(where ? { where } : {}) }),
      prisma.order.findMany({
        ...(where ? { where } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            select: {
              id: true,
              kind: true,
              productId: true,
              seedSetId: true,
              productNameSnapshot: true,
              priceSnapshot: true,
              quantity: true,
              isPreorder: true,
              imageUrlSnapshot: true,
              serviceCode: true,
              product: {
                select: {
                  stock: true,
                },
              },
              components: {
                select: {
                  productNameSnapshot: true,
                  productId: true,
                  quantity: true,
                },
                orderBy: { createdAt: "asc" },
              },
            },
          },
          shipment: true,
          statusHistory: { orderBy: { createdAt: "asc" } },
          paymentAttempts: { orderBy: { attemptNumber: "desc" } },
          inventoryReservations: {
            where: { backorderQuantity: { gt: 0 } },
            select: { backorderQuantity: true, product: { select: { name: true } } },
          },
        },
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const ordersWithStockFlags = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      phone: order.phone,
      email: order.email,
      address: order.address,
      comment: order.comment,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      totalPrice: order.totalPrice,
      subtotalPrice: order.subtotalPrice,
      discountPrice: order.discountPrice,
      giftWrapPrice: order.giftWrapPrice,
      shippingPrice: order.shippingPrice,
      shippingMethod: order.shippingMethod,
      isRepeatCustomer: order.isRepeatCustomer,
      requiresStockReview: order.requiresStockReview,
      preorderRequired: order.preorderRequired,
      preorderConfirmedAt: order.preorderConfirmedAt?.toISOString() ?? null,
      preorderNote: order.preorderNote,
      backorders: order.inventoryReservations.map((row) => ({ name: row.product.name, quantity: row.backorderQuantity })),
      requiresPaymentReview: order.requiresPaymentReview,
      paymentStatus: order.paymentStatus,
      yookassaPaymentId: order.yookassaPaymentId,
      paidAt: order.paidAt?.toISOString() ?? null,
      paymentUpdatedAt: order.paymentUpdatedAt?.toISOString() ?? null,
      shipment: order.shipment
        ? {
            ...order.shipment,
            shippedAt: order.shipment.shippedAt?.toISOString() ?? null,
            deliveredAt: order.shipment.deliveredAt?.toISOString() ?? null,
            createdAt: order.shipment.createdAt.toISOString(),
            updatedAt: order.shipment.updatedAt.toISOString(),
          }
        : null,
      statusHistory: order.statusHistory.map((entry) => ({
        id: entry.id,
        from: entry.from,
        to: entry.to,
        actorType: entry.actorType,
        note: entry.note,
        createdAt: entry.createdAt.toISOString(),
      })),
      paymentAttempts: order.paymentAttempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        providerPaymentId: attempt.providerPaymentId,
        errorMessage: attempt.errorMessage,
        createdAt: attempt.createdAt.toISOString(),
        updatedAt: attempt.updatedAt.toISOString(),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        productId: item.productId,
        seedSetId: item.seedSetId,
        productNameSnapshot: item.productNameSnapshot,
        priceSnapshot: item.priceSnapshot,
        quantity: item.quantity,
        isPreorder: item.isPreorder,
        stock: item.product?.stock ?? null,
        requiresStockConfirmation:
          item.product?.stock !== null && item.product?.stock !== undefined
            ? item.quantity > item.product.stock
            : false,
        contents: item.components.map((component) => component.productNameSnapshot),
      })),
    }));

    return ok(
      ordersWithStockFlags,
      undefined,
      {
        total,
        page,
        pageSize,
        totalPages,
      }
    );
  } catch {
    return Response.json(
      {
        ok: false,
        error: "Не удалось загрузить заказы.",
      },
      { status: 500 }
    );
  }
}
