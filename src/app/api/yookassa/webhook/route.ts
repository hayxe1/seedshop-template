import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import {
  applyYookassaE2ENotification,
  getYookassaPayment,
  getYookassaRefund,
} from "@/lib/yookassa";
import { syncYookassaPayment } from "@/server/commerce/payment-sync";
import { syncYookassaRefund } from "@/server/commerce/refund-sync";
import { scheduleNotificationOutboxProcessing } from "@/server/commerce/notification-worker";

export const dynamic = "force-dynamic";

function parseNotification(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const notification = payload as { event?: unknown; type?: unknown; object?: unknown };
  if (
    notification.type !== "notification" ||
    typeof notification.event !== "string" ||
    ![
      "payment.succeeded",
      "payment.canceled",
      "payment.waiting_for_capture",
      "refund.succeeded",
    ].includes(notification.event) ||
    !notification.object ||
    typeof notification.object !== "object"
  ) {
    return null;
  }

  const objectId = (notification.object as { id?: unknown }).id;
  if (typeof objectId !== "string") {
    return null;
  }

  return notification.event === "refund.succeeded"
    ? { kind: "refund" as const, eventType: notification.event, objectId }
    : { kind: "payment" as const, eventType: notification.event, objectId };
}

export async function POST(request: Request) {
  const limit = await consumeRateLimit({
    key: rateLimitKey("yookassa-webhook", getClientIp(request)),
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (limit.limited) {
    return rateLimitResponse(limit);
  }

  const payload = await request.json().catch(() => null);
  const notification = parseNotification(payload);
  if (!notification) {
    return Response.json({ ok: true });
  }

  try {
    if (notification.kind === "payment") {
      applyYookassaE2ENotification(notification.objectId, notification.eventType);
    }
    const order =
      notification.kind === "refund"
        ? await syncYookassaRefund(prisma, await getYookassaRefund(notification.objectId), {
            eventType: notification.eventType,
            eventPayload: payload as Prisma.InputJsonValue,
          })
        : await syncYookassaPayment(prisma, await getYookassaPayment(notification.objectId), {
            eventType: notification.eventType,
            eventPayload: payload as Prisma.InputJsonValue,
          });

    if (!order) {
      return Response.json(
        { ok: false, error: "Order is not available yet." },
        { status: 503 }
      );
    }

    scheduleNotificationOutboxProcessing();

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[yookassa/webhook] processing failed", {
      objectId: notification.objectId,
      objectKind: notification.kind,
      eventType: notification.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ ok: false }, { status: 500 });
  }
}
