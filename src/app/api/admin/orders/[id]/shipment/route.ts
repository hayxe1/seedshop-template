import { FulfillmentStatus, ShipmentStatus, ShippingMethod } from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { buildOrderAccessUrl } from "@/server/commerce/order-view";
import { scheduleNotificationOutboxProcessing } from "@/server/commerce/notification-worker";
import { enqueueShipmentNotification } from "@/server/commerce/outbox";
import {
  fail,
  ok,
  parseJsonBody,
  updateShipmentBodySchema,
} from "@/shared/api/contracts";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  const bodyResult = await parseJsonBody(
    request,
    updateShipmentBodySchema,
    "Проверьте данные доставки."
  );
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  try {
    const { id } = await context.params;
    const body = bodyResult.data;
    const address = body.address?.trim() || null;
    const price = body.method === ShippingMethod.SELF_PICKUP ? 0 : body.price;

    if (body.method === ShippingMethod.LOCAL_COURIER && !address) {
      return fail(400, "DELIVERY_ADDRESS_REQUIRED", "Укажите адрес доставки в Воронеже.");
    }
    if (
      body.method === ShippingMethod.LOCAL_COURIER &&
      address &&
      !/(^|[\s,])(?:г\.?\s*)?воронеж(?:[\s,]|$)/iu.test(address)
    ) {
      return fail(400, "DELIVERY_OUTSIDE_VORONEZH", "Доставка доступна только по Воронежу.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          orderNumber: true,
          email: true,
          checkoutKey: true,
          fulfillmentStatus: true,
        },
      });
      if (!order) {
        throw new Error("ORDER_NOT_FOUND");
      }

      const shipment = await tx.shipment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          method: body.method,
          price,
          addressSnapshot: address,
          trackingNumber: body.trackingNumber || null,
          managerNote: body.managerNote || null,
          status:
            order.fulfillmentStatus === FulfillmentStatus.SHIPPED
              ? ShipmentStatus.SHIPPED
              : ShipmentStatus.AWAITING_DETAILS,
        },
        update: {
          method: body.method,
          price,
          addressSnapshot: address,
          trackingNumber: body.trackingNumber || null,
          managerNote: body.managerNote || null,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          shippingMethod: body.method,
          shippingPrice: price,
          address,
        },
      });

      if (order.fulfillmentStatus === FulfillmentStatus.SHIPPED) {
        await enqueueShipmentNotification(tx, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          email: order.email,
          trackingNumber: shipment.trackingNumber,
          orderUrl: buildOrderAccessUrl(order.checkoutKey),
        });
      }

      return shipment;
    });
    scheduleNotificationOutboxProcessing();

    return ok({
      method: result.method,
      status: result.status,
      price: result.price,
      addressSnapshot: result.addressSnapshot,
      trackingNumber: result.trackingNumber,
      managerNote: result.managerNote,
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return fail(404, "ORDER_NOT_FOUND", "Заказ не найден.");
    }
    return fail(500, "UPDATE_SHIPMENT_FAILED", "Не удалось сохранить доставку.");
  }
}
