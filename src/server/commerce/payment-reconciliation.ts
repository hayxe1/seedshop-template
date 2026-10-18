import "server-only";

import { PaymentStatus, type PrismaClient } from "@prisma/client";
import { getYookassaCredentials } from "@/lib/env";
import { getYookassaPayment } from "@/lib/yookassa";
import { syncYookassaPayment } from "@/server/commerce/payment-sync";

const RECONCILIATION_LIMIT = 25;
const MINIMUM_ATTEMPT_AGE_MS = 2 * 60 * 1000;

function providerStatus(status: string) {
  if (status === "waiting_for_capture") return PaymentStatus.WAITING_FOR_CAPTURE;
  if (status === "succeeded") return PaymentStatus.SUCCEEDED;
  if (status === "canceled") return PaymentStatus.CANCELED;
  return PaymentStatus.PENDING;
}

export async function reconcilePendingYookassaPayments(
  prisma: PrismaClient,
  limit = RECONCILIATION_LIMIT
) {
  if (!getYookassaCredentials().isConfigured) {
    return { checked: 0, updated: 0, failed: 0, skipped: true };
  }

  const attempts = await prisma.paymentAttempt.findMany({
    where: {
      provider: "yookassa",
      status: { in: [PaymentStatus.PENDING, PaymentStatus.WAITING_FOR_CAPTURE] },
      providerPaymentId: { not: null },
      updatedAt: { lte: new Date(Date.now() - MINIMUM_ATTEMPT_AGE_MS) },
    },
    select: { status: true, providerPaymentId: true },
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
  });

  let checked = 0;
  let updated = 0;
  let failed = 0;
  const seenPaymentIds = new Set<string>();

  for (const attempt of attempts) {
    const paymentId = attempt.providerPaymentId;
    if (!paymentId || seenPaymentIds.has(paymentId)) continue;
    seenPaymentIds.add(paymentId);

    try {
      const payment = await getYookassaPayment(paymentId);
      checked += 1;
      if (providerStatus(payment.status) !== attempt.status) updated += 1;
      await syncYookassaPayment(prisma, payment, {
        eventType: `cron.reconcile.${payment.status}`,
      });
    } catch (error) {
      failed += 1;
      console.error("[commerce/reconcile] YooKassa payment check failed", {
        paymentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { checked, updated, failed, skipped: false };
}
