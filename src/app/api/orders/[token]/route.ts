import {
  consumeRateLimit,
  getClientIp,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { findOrderByAccessToken } from "@/server/commerce/order-view";
import { fail, ok } from "@/shared/api/contracts";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const limit = await consumeRateLimit({
    key: rateLimitKey("public-order", getClientIp(request), token),
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (limit.limited) {
    return rateLimitResponse(limit);
  }

  const order = await findOrderByAccessToken(token);
  if (!order) {
    return fail(404, "ORDER_NOT_FOUND", "Заказ не найден или ссылка устарела.");
  }

  return ok(order.data);
}
