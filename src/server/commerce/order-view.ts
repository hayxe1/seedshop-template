import "server-only";
import { PaymentStatus } from "@prisma/client";
import { hashPaymentResultToken } from "@/lib/payment-result-token";
import { createOrderAccessToken } from "@/lib/payment-result-token";
import { getSiteUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const retryablePaymentStatuses = new Set<PaymentStatus>([
  PaymentStatus.NOT_STARTED,
  PaymentStatus.CANCELED,
  PaymentStatus.FAILED,
]);

export function buildOrderAccessUrl(checkoutKey: string | null) {
  if (!checkoutKey) {
    return `${getSiteUrl()}/contacts`;
  }
  return `${getSiteUrl()}/order/${encodeURIComponent(
    createOrderAccessToken(checkoutKey).token
  )}`;
}

export async function findOrderByAccessToken(token: string) {
  const normalizedToken = token.trim();
  if (!normalizedToken || normalizedToken.length > 128) {
    return null;
  }

  const order = await prisma.order.findUnique({
    where: { paymentResultTokenHash: hashPaymentResultToken(normalizedToken) },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      phone: true,
      email: true,
      address: true,
      comment: true,
      fulfillmentStatus: true,
      paymentStatus: true,
      preorderRequired: true,
      preorderConfirmedAt: true,
      preorderNote: true,
      subtotalPrice: true,
      discountPrice: true,
      giftWrapPrice: true,
      shippingPrice: true,
      totalPrice: true,
      shippingMethod: true,
      createdAt: true,
      updatedAt: true,
      paymentResultTokenExpiresAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          productId: true,
          seedSetId: true,
          product: {
            select: {
              category: { select: { name: true } },
            },
          },
          productNameSnapshot: true,
          imageUrlSnapshot: true,
          priceSnapshot: true,
          quantity: true,
          isPreorder: true,
          components: {
            orderBy: { createdAt: "asc" },
            select: { productNameSnapshot: true },
          },
        },
      },
      paymentAttempts: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
        select: {
          confirmationUrl: true,
          status: true,
        },
      },
      inventoryReservations: {
        where: { status: "ACTIVE" },
        orderBy: { expiresAt: "desc" },
        take: 1,
        select: { expiresAt: true },
      },
      shipment: {
        select: {
          status: true,
          trackingNumber: true,
          shippedAt: true,
          deliveredAt: true,
        },
      },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        select: { to: true, createdAt: true },
      },
    },
  });

  if (!order) {
    return null;
  }
  if (
    order.paymentResultTokenExpiresAt &&
    order.paymentResultTokenExpiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  const latestAttempt = order.paymentAttempts[0] ?? null;
  const preorderPending = order.preorderRequired && !order.preorderConfirmedAt &&
    order.fulfillmentStatus !== "CANCELLED" && order.paymentStatus !== "REFUNDED";

  return {
    id: order.id,
    data: {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      phone: order.phone,
      email: order.email,
      address: order.address,
      comment: order.comment,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentStatus: order.paymentStatus,
      preorderPending,
      preorderNote: order.preorderNote,
      subtotalPrice: order.subtotalPrice,
      discountPrice: order.discountPrice,
      giftWrapPrice: order.giftWrapPrice,
      shippingPrice: order.shippingPrice,
      totalPrice: order.totalPrice,
      shippingMethod: order.shippingMethod,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      paymentConfirmationUrl:
        preorderPending || order.fulfillmentStatus === "CANCELLED" ? null : latestAttempt?.confirmationUrl ?? null,
      canRetryPayment:
        !preorderPending &&
        order.fulfillmentStatus !== "CANCELLED" &&
        retryablePaymentStatuses.has(order.paymentStatus),
      reservationExpiresAt:
        order.inventoryReservations[0]?.expiresAt.toISOString() ?? null,
      shipment: order.shipment
        ? {
            status: order.shipment.status,
            trackingNumber: order.shipment.trackingNumber,
            shippedAt: order.shipment.shippedAt?.toISOString() ?? null,
            deliveredAt: order.shipment.deliveredAt?.toISOString() ?? null,
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        productId: item.productId,
        seedSetId: item.seedSetId,
        category:
          item.kind === "SEED_SET"
            ? "Готовые наборы"
            : item.product?.category.name ?? null,
        name: item.productNameSnapshot,
        imageUrl: item.imageUrlSnapshot,
        price: item.priceSnapshot,
        quantity: item.quantity,
        isPreorder: item.isPreorder,
        contents: item.components.map((component) => component.productNameSnapshot),
      })),
      timeline: order.statusHistory.map((entry) => ({
        status: entry.to,
        note: null,
        createdAt: entry.createdAt.toISOString(),
      })),
    },
  };
}
