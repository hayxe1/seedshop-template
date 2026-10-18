import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { getYookassaPayment } from "@/lib/yookassa";
import { findOrderByAccessToken } from "@/server/commerce/order-view";
import { scheduleNotificationOutboxProcessing } from "@/server/commerce/notification-worker";
import { syncYookassaPayment } from "@/server/commerce/payment-sync";
import { fail, ok, parseJsonBody } from "@/shared/api/contracts";

export const dynamic = "force-dynamic";

const refreshPaymentBodySchema = z.object({
  token: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const bodyResult = await parseJsonBody(
    request,
    refreshPaymentBodySchema,
    "Передан некорректный токен проверки оплаты."
  );
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const token = bodyResult.data.token.trim();
  const limit = await consumeRateLimit({
    key: rateLimitKey("payment-result-refresh", getClientIp(request), token),
    limit: 35,
    windowMs: 60 * 1000,
  });
  if (limit.limited) {
    return rateLimitResponse(limit);
  }

  const publicOrder = await findOrderByAccessToken(token);
  if (!publicOrder) {
    return fail(404, "ORDER_NOT_FOUND", "Заказ не найден или ссылка устарела.");
  }

  const order = await prisma.order.findUnique({
    where: { id: publicOrder.id },
    select: {
      yookassaPaymentId: true,
      paymentAttempts: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
        select: { providerPaymentId: true },
      },
    },
  });
  const paymentId = order?.paymentAttempts[0]?.providerPaymentId ?? order?.yookassaPaymentId;

  if (paymentId) {
    try {
      const payment = await getYookassaPayment(paymentId);
      await syncYookassaPayment(prisma, payment, { eventType: "client.refresh" });
      scheduleNotificationOutboxProcessing();
    } catch {
      return fail(
        502,
        "PAYMENT_REFRESH_FAILED",
        "Не удалось проверить платёж прямо сейчас. Статус обновится автоматически."
      );
    }
  }

  const updated = await findOrderByAccessToken(token);
  if (!updated) {
    return fail(404, "ORDER_NOT_FOUND", "Заказ не найден.");
  }

  return ok({
    orderNumber: updated.data.orderNumber,
    paymentStatus: updated.data.paymentStatus,
    fulfillmentStatus: updated.data.fulfillmentStatus,
    paymentConfirmationUrl: updated.data.paymentConfirmationUrl,
    canRetryPayment: updated.data.canRetryPayment,
  });
}
