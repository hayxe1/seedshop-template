import {
  FulfillmentStatus,
  InventoryReservationStatus,
  OrderStatus,
  PaymentStatus,
  ShipmentStatus,
  Prisma,
} from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { fulfillOrderBackorders, releaseOrderReservations } from "@/server/commerce/inventory";
import { isCommerceError } from "@/server/commerce/errors";
import { buildOrderAccessUrl } from "@/server/commerce/order-view";
import { scheduleNotificationOutboxProcessing } from "@/server/commerce/notification-worker";
import { enqueueShipmentNotification } from "@/server/commerce/outbox";
import {
  fail,
  fulfillmentStatusSchema,
  ok,
  parseJsonBody,
  updateOrderStatusBodySchema,
} from "@/shared/api/contracts";

const transitions: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  NEW: [FulfillmentStatus.PROCESSING, FulfillmentStatus.CANCELLED],
  PROCESSING: [FulfillmentStatus.PACKED, FulfillmentStatus.CANCELLED],
  PACKED: [FulfillmentStatus.SHIPPED, FulfillmentStatus.CANCELLED],
  SHIPPED: [FulfillmentStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

function legacyStatus(status: FulfillmentStatus) {
  if (status === FulfillmentStatus.NEW) return OrderStatus.PENDING;
  if (status === FulfillmentStatus.DELIVERED) return OrderStatus.COMPLETED;
  if (status === FulfillmentStatus.CANCELLED) return OrderStatus.CANCELLED;
  return OrderStatus.CONFIRMED;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const { id } = await context.params;
    const bodyResult = await parseJsonBody(
      request,
      updateOrderStatusBodySchema,
      "Передан некорректный статус заказа."
    );
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const parsedStatus = fulfillmentStatusSchema.safeParse(
      String(bodyResult.data.status ?? "").toUpperCase()
    );
    if (!parsedStatus.success) {
      return fail(400, "VALIDATION_ERROR", "Передан некорректный статус заказа.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`);
      const order = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          orderNumber: true,
          email: true,
          checkoutKey: true,
          fulfillmentStatus: true,
          paymentStatus: true,
          preorderRequired: true,
          preorderConfirmedAt: true,
          shipment: { select: { trackingNumber: true } },
        },
      });
      if (!order) {
        throw new Error("ORDER_NOT_FOUND");
      }

      const nextStatus = parsedStatus.data;
      if (nextStatus === order.fulfillmentStatus) {
        return tx.order.findUniqueOrThrow({
          where: { id },
          select: { id: true, fulfillmentStatus: true, updatedAt: true },
        });
      }

      if (!transitions[order.fulfillmentStatus].includes(nextStatus)) {
        throw new Error("INVALID_TRANSITION");
      }
      if (nextStatus === FulfillmentStatus.PACKED) {
        if (order.preorderRequired && (!order.preorderConfirmedAt || order.paymentStatus !== PaymentStatus.SUCCEEDED)) {
          throw new Error("PAYMENT_REQUIRED");
        }
        await fulfillOrderBackorders(tx, order.id);
      }
      if (
        (nextStatus === FulfillmentStatus.SHIPPED ||
          nextStatus === FulfillmentStatus.DELIVERED) &&
        order.paymentStatus !== PaymentStatus.SUCCEEDED
      ) {
        throw new Error("PAYMENT_REQUIRED");
      }

      if (
        nextStatus === FulfillmentStatus.CANCELLED &&
        order.paymentStatus !== PaymentStatus.SUCCEEDED
      ) {
        await releaseOrderReservations(
          tx,
          order.id,
          InventoryReservationStatus.RELEASED
        );
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          from: order.fulfillmentStatus,
          to: nextStatus,
          actorType: "admin",
          actorId: admin.id,
          note:
            bodyResult.data.note?.trim() ||
            (nextStatus === FulfillmentStatus.CANCELLED && order.paymentStatus === PaymentStatus.SUCCEEDED
              ? "Оплаченный заказ отменён — требуется проверить возврат средств."
              : null),
        },
      });
      await tx.shipment.updateMany({
        where: { orderId: order.id },
        data:
          nextStatus === FulfillmentStatus.SHIPPED
            ? { status: ShipmentStatus.SHIPPED, shippedAt: new Date() }
            : nextStatus === FulfillmentStatus.DELIVERED
              ? { status: ShipmentStatus.DELIVERED, deliveredAt: new Date() }
              : nextStatus === FulfillmentStatus.CANCELLED
                ? { status: ShipmentStatus.CANCELED }
                : nextStatus === FulfillmentStatus.PACKED
                  ? { status: ShipmentStatus.READY }
                  : {},
      });

      if (nextStatus === FulfillmentStatus.SHIPPED) {
        await enqueueShipmentNotification(tx, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          email: order.email,
          trackingNumber: order.shipment?.trackingNumber ?? null,
          orderUrl: buildOrderAccessUrl(order.checkoutKey),
        });
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStatus: nextStatus,
          status: legacyStatus(nextStatus),
          ...(nextStatus === FulfillmentStatus.CANCELLED && order.paymentStatus === PaymentStatus.SUCCEEDED
            ? { requiresPaymentReview: true }
            : {}),
        },
        select: {
          id: true,
          fulfillmentStatus: true,
          updatedAt: true,
        },
      });
    });
    scheduleNotificationOutboxProcessing();

    return ok({
      id: updated.id,
      status: updated.fulfillmentStatus,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    if (isCommerceError(error)) return fail(error.status, error.code, error.message);
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return fail(404, "ORDER_NOT_FOUND", "Заказ не найден.");
    }
    if (error instanceof Error && error.message === "INVALID_TRANSITION") {
      return fail(409, "INVALID_TRANSITION", "Этот переход статуса недоступен.");
    }
    if (error instanceof Error && error.message === "PAYMENT_REQUIRED") {
      return fail(409, "PAYMENT_REQUIRED", "Неоплаченный заказ нельзя отправить или завершить.");
    }
    return fail(500, "UPDATE_ORDER_STATUS_FAILED", "Не удалось обновить статус заказа.");
  }
}
