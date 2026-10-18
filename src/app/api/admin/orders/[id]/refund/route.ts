import { FulfillmentStatus, PaymentStatus, type Prisma } from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { getYookassaCredentials } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  createYookassaRefund,
  YookassaApiError,
  YookassaConfigError,
} from "@/lib/yookassa";
import { syncYookassaRefund } from "@/server/commerce/refund-sync";
import { fail, ok, parseJsonBody, refundOrderBodySchema } from "@/shared/api/contracts";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  const bodyResult = await parseJsonBody(request, refundOrderBodySchema);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  try {
    const { id } = await context.params;
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        fulfillmentStatus: true,
        paymentStatus: true,
        totalPrice: true,
        yookassaPaymentId: true,
        paymentUpdatedAt: true,
        paymentEvents: {
          where: { eventType: { in: ["refund.succeeded", "admin.refund.succeeded"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { eventKey: true },
        },
      },
    });

    if (!order) {
      return fail(404, "ORDER_NOT_FOUND", "Заказ не найден.");
    }
    if (order.fulfillmentStatus !== FulfillmentStatus.CANCELLED) {
      return fail(409, "ORDER_NOT_CANCELLED", "Сначала отмените заказ в админке.");
    }
    if (order.paymentStatus === PaymentStatus.REFUNDED) {
      return ok({
        id: order.id,
        paymentStatus: order.paymentStatus,
        refundStatus: "succeeded" as const,
        refundId: order.paymentEvents[0]?.eventKey.split(":")[2] ?? "already-refunded",
        fullRefund: true,
        paymentUpdatedAt: order.paymentUpdatedAt?.toISOString() ?? null,
      });
    }
    if (order.paymentStatus !== PaymentStatus.SUCCEEDED) {
      return fail(409, "PAYMENT_NOT_REFUNDABLE", "Вернуть можно только успешно оплаченную сумму.");
    }
    if (!order.yookassaPaymentId) {
      return fail(409, "PAYMENT_ID_MISSING", "У заказа отсутствует идентификатор платежа YooKassa.");
    }
    if (!getYookassaCredentials().isConfigured) {
      return fail(503, "YOOKASSA_NOT_CONFIGURED", "Ключи YooKassa не настроены.");
    }

    const reason = bodyResult.data.reason?.trim();
    const refund = await createYookassaRefund({
      paymentId: order.yookassaPaymentId,
      amountRub: order.totalPrice,
      idempotencyKey: `refund:order:${order.id}:full:v1`,
      description: reason
        ? `Возврат заказа ${order.orderNumber}: ${reason}`
        : `Полный возврат заказа ${order.orderNumber}`,
    });
    const synced = await syncYookassaRefund(prisma, refund, {
      eventType: `admin.refund.${refund.status}`,
      eventPayload: refund as unknown as Prisma.InputJsonValue,
    });

    if (!synced) {
      return fail(503, "REFUND_NOT_SYNCED", "Возврат создан, но заказ пока не синхронизирован.");
    }
    if (refund.status === "canceled") {
      return fail(502, "YOOKASSA_REFUND_CANCELED", "YooKassa отклонила возврат. Проверьте баланс магазина.");
    }

    const syncedPaymentUpdatedAt = (
      synced as { paymentUpdatedAt?: Date | null }
    ).paymentUpdatedAt;

    return ok(
      {
        id: synced.id,
        paymentStatus: synced.paymentStatus,
        refundStatus: synced.refundStatus,
        refundId: synced.refundId,
        fullRefund: synced.fullRefund,
        paymentUpdatedAt: syncedPaymentUpdatedAt?.toISOString() ?? null,
      },
      refund.status === "pending" ? { status: 202 } : undefined
    );
  } catch (error) {
    if (error instanceof YookassaConfigError) {
      return fail(503, "YOOKASSA_NOT_CONFIGURED", "Ключи YooKassa не настроены.");
    }
    if (error instanceof YookassaApiError) {
      console.error("[api/admin/orders/refund] YooKassa request failed", {
        error: error.message,
        details: error.details,
      });
      return fail(502, "YOOKASSA_REFUND_FAILED", "YooKassa не смогла выполнить возврат.");
    }

    console.error("[api/admin/orders/refund] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(500, "REFUND_FAILED", "Не удалось выполнить возврат.");
  }
}
