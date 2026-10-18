import { getYookassaCredentials } from "@/lib/env";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { retryOrderPayment } from "@/server/commerce/checkout";
import { isCommerceError } from "@/server/commerce/errors";
import { findOrderByAccessToken } from "@/server/commerce/order-view";
import { scheduleNotificationOutboxProcessing } from "@/server/commerce/notification-worker";
import { fail, ok } from "@/shared/api/contracts";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const limit = await consumeRateLimit({
    key: rateLimitKey("payment-retry", getClientIp(request), token),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (limit.limited) {
    return rateLimitResponse(limit);
  }

  try {
    const order = await findOrderByAccessToken(token);
    if (!order) {
      return fail(404, "ORDER_NOT_FOUND", "Заказ не найден или ссылка устарела.");
    }
    if (!getYookassaCredentials().isConfigured) {
      return fail(503, "YOOKASSA_NOT_CONFIGURED", "Онлайн-оплата временно недоступна.");
    }

    await retryOrderPayment(order.id, token);
    scheduleNotificationOutboxProcessing();
    const updated = await findOrderByAccessToken(token);
    if (!updated) {
      return fail(404, "ORDER_NOT_FOUND", "Заказ не найден.");
    }

    return ok(updated.data);
  } catch (error) {
    if (isCommerceError(error)) {
      return fail(error.status, error.code, error.message);
    }
    return fail(500, "PAYMENT_RETRY_FAILED", "Не удалось повторить оплату.");
  }
}
