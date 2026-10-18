import { expireStaleReservations } from "@/server/commerce/inventory";
import { processNotificationOutbox } from "@/server/commerce/notification-worker";
import { reconcilePendingYookassaPayments } from "@/server/commerce/payment-reconciliation";
import { prisma } from "@/lib/prisma";
import { cleanupExpiredRateLimits } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const payments = await reconcilePendingYookassaPayments(prisma);
  const [expired, notifications, rateLimits] = await Promise.all([
    expireStaleReservations(prisma),
    processNotificationOutbox(),
    cleanupExpiredRateLimits(),
  ]);

  return Response.json({
    ok: true,
    payments,
    expiredReservations: expired.count,
    notifications,
    deletedRateLimitBuckets: rateLimits.count,
  });
}
