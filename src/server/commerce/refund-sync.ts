import "server-only";
import {
  InventoryMovementReason,
  PaymentStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import type { YookassaRefund } from "@/lib/yookassa";
import { withSerializableRetry } from "@/server/commerce/transaction-retry";

type SyncRefundOptions = {
  eventType?: string;
  eventPayload?: Prisma.InputJsonValue;
};

function refundEventKey(refund: YookassaRefund, eventType?: string) {
  return `yookassa:refund:${refund.id}:${eventType ?? refund.status}`;
}

function isFullRefund(refund: YookassaRefund, totalPrice: number) {
  return (
    refund.status === "succeeded" &&
    refund.amount?.value === totalPrice.toFixed(2) &&
    refund.amount.currency === "RUB"
  );
}

async function restoreSoldInventory(tx: Prisma.TransactionClient, orderId: string) {
  const movements = await tx.inventoryMovement.findMany({
    where: { orderId, reason: { in: [InventoryMovementReason.SALE, InventoryMovementReason.RETURN] } },
    select: { productId: true, delta: true },
  });
  const quantities = new Map<string, number>();

  for (const movement of movements) {
    quantities.set(movement.productId, (quantities.get(movement.productId) ?? 0) - movement.delta);
  }

  let requiresStockReview = false;
  const productIds = [...quantities.keys()].sort();
  if (productIds.length > 0) await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR UPDATE`
  );
  for (const productId of productIds) {
    const quantity = quantities.get(productId)!;
    if (quantity <= 0) continue;
    const updated = await tx.product.updateMany({
      where: { id: productId, stock: { not: null } },
      data: { stock: { increment: quantity } },
    });

    if (updated.count === 0) {
      requiresStockReview = true;
      continue;
    }

    await tx.inventoryMovement.create({
      data: {
        productId,
        orderId,
        delta: quantity,
        reason: InventoryMovementReason.RETURN,
        note: "Возврат остатка после полного возврата оплаты",
      },
    });
  }

  return requiresStockReview;
}

export async function syncYookassaRefund(
  prisma: PrismaClient,
  refund: YookassaRefund,
  options: SyncRefundOptions = {}
) {
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { yookassaPaymentId: refund.payment_id },
        { paymentAttempts: { some: { providerPaymentId: refund.payment_id } } },
      ],
    },
    select: { id: true },
  });

  if (!order) {
    return null;
  }

  return withSerializableRetry(() => prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`
      );

      const current = await tx.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          paymentStatus: true,
          requiresStockReview: true,
        },
      });
      if (!current) {
        return null;
      }

      const eventType = options.eventType ?? `refund.${refund.status}`;
      const eventKey = refundEventKey(refund, eventType);
      await tx.paymentEvent.upsert({
        where: { eventKey },
        create: {
          orderId: current.id,
          eventKey,
          eventType,
          providerPaymentId: refund.payment_id,
          ...(options.eventPayload !== undefined ? { payload: options.eventPayload } : {}),
        },
        update: {},
      });

      if (refund.status !== "succeeded") {
        await tx.order.update({
          where: { id: current.id },
          data: { requiresPaymentReview: true, paymentUpdatedAt: new Date() },
        });
        await tx.paymentEvent.update({
          where: { eventKey },
          data: { processedAt: new Date(), processingError: null },
        });
        return {
          id: current.id,
          orderNumber: current.orderNumber,
          paymentStatus: current.paymentStatus,
          refundStatus: refund.status,
          refundId: refund.id,
          fullRefund: false,
        };
      }

      if (!isFullRefund(refund, current.totalPrice)) {
        await tx.order.update({
          where: { id: current.id },
          data: { requiresPaymentReview: true, paymentUpdatedAt: new Date() },
        });
        await tx.paymentEvent.update({
          where: { eventKey },
          data: {
            processedAt: new Date(),
            processingError: "Refund amount does not match the full order amount.",
          },
        });
        return {
          id: current.id,
          orderNumber: current.orderNumber,
          paymentStatus: current.paymentStatus,
          refundStatus: refund.status,
          refundId: refund.id,
          fullRefund: false,
        };
      }

      let requiresStockReview = current.requiresStockReview;
      if (current.paymentStatus !== PaymentStatus.REFUNDED) {
        requiresStockReview =
          (await restoreSoldInventory(tx, current.id)) || requiresStockReview;
        await tx.paymentAttempt.updateMany({
          where: { orderId: current.id, providerPaymentId: refund.payment_id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }

      const updated = await tx.order.update({
        where: { id: current.id },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          paymentUpdatedAt: new Date(),
          requiresPaymentReview: false,
          requiresStockReview,
        },
        select: { id: true, orderNumber: true, paymentStatus: true, paymentUpdatedAt: true },
      });
      await tx.paymentEvent.update({
        where: { eventKey },
        data: { processedAt: new Date(), processingError: null },
      });

      return {
        ...updated,
        refundStatus: refund.status,
        refundId: refund.id,
        fullRefund: true,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    }
  ));
}
