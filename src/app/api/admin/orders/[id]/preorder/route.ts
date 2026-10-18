import { Prisma } from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { reserveInventoryForExistingOrder } from "@/server/commerce/inventory";
import { fail, ok, parseJsonBody, confirmPreorderBodySchema } from "@/shared/api/contracts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) return admin;
  const body = await parseJsonBody(request, confirmPreorderBodySchema);
  if (!body.ok) return body.response;
  const { id } = await context.params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`);
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) return null;
      if (order.fulfillmentStatus === "CANCELLED" || order.paymentStatus === "REFUNDED") {
        throw new Error("ORDER_CLOSED");
      }
      if (!order.preorderRequired || order.preorderConfirmedAt) return { id: order.id };
      // Refresh the allocation before approving it, so payment sees the same shortage.
      await reserveInventoryForExistingOrder(tx, id);
      await tx.order.update({
        where: { id },
        data: { preorderConfirmedAt: new Date(), preorderNote: body.data.note },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id, from: order.fulfillmentStatus, to: order.fulfillmentStatus,
          actorType: "admin", actorId: admin.id,
          note: `Срок поставки согласован с покупателем: ${body.data.note}`,
        },
      });
      return { id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return result ? ok(result) : fail(404, "ORDER_NOT_FOUND", "Заказ не найден.");
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_CLOSED") {
      return fail(409, "ORDER_CLOSED", "Закрытый заказ нельзя подтвердить.");
    }
    return fail(500, "PREORDER_CONFIRM_FAILED", "Не удалось подтвердить срок поставки.");
  }
}
