import "server-only";
import { after } from "next/server";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STORE_BRAND } from "@/shared/config/store";

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function text(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailTemplate(template: string, payload: Record<string, unknown>) {
  const orderNumber = escapeHtml(text(payload, "orderNumber"));
  const customerName = escapeHtml(text(payload, "customerName"));
  const orderUrl = escapeHtml(text(payload, "orderUrl"));
  const totalPrice = Number(payload.totalPrice ?? 0).toLocaleString("ru-RU");

  if (template === "payment-succeeded") {
    return {
      subject: `Оплата заказа ${orderNumber} получена`,
      title: "Спасибо, оплата получена",
      body: `Заказ ${orderNumber} на сумму ${totalPrice} ₽ передан в обработку.`,
      orderUrl,
    };
  }
  if (template === "order-shipped") {
    const trackingNumber = escapeHtml(text(payload, "trackingNumber"));
    return {
      subject: `Заказ ${orderNumber} передан в доставку`,
      title: "Заказ отправлен",
      body: trackingNumber
        ? `Трек-номер: ${trackingNumber}.`
        : "Информация о доставке появится на странице заказа.",
      orderUrl,
    };
  }

  return {
    subject: `Заказ ${orderNumber} создан`,
    title: `Заказ сохранён${customerName ? `, ${customerName}` : ""}`,
    body: `Мы получили заказ на сумму ${totalPrice} ₽. Доставка согласуется отдельно.`,
    orderUrl,
  };
}

async function sendEmail(recipient: string, template: string, payload: Record<string, unknown>) {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.EMAIL_FROM ?? "").trim();
  if (!apiKey || !from) {
    throw new Error("Email provider is not configured.");
  }

  const content = emailTemplate(template, payload);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: content.subject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;line-height:1.6">
          <h1 style="font-size:28px;line-height:1.2">${content.title}</h1>
          <p>${content.body}</p>
          ${
            content.orderUrl
              ? `<p><a href="${content.orderUrl}" style="display:inline-block;background:#2d9a5a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Открыть заказ</a></p>`
              : ""
          }
          <p style="color:#3e4a40;font-size:14px">${escapeHtml(STORE_BRAND.name)}</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}.`);
  }
}

async function sendTelegram(recipient: string, template: string, payload: Record<string, unknown>) {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) {
    throw new Error("Telegram provider is not configured.");
  }

  const orderNumber = text(payload, "orderNumber");
  const customerName = text(payload, "customerName");
  const phone = text(payload, "phone");
  const totalPrice = Number(payload.totalPrice ?? 0).toLocaleString("ru-RU");
  const title = template === "seller-payment-succeeded" ? "Заказ оплачен" : "Новый заказ";
  const message = [
    `${title}: ${orderNumber}`,
    customerName ? `Покупатель: ${customerName}` : "",
    phone ? `Телефон: ${phone}` : "",
    `Сумма: ${totalPrice} ₽`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: recipient, text: message }),
  });

  if (!response.ok) {
    throw new Error(`Telegram provider returned ${response.status}.`);
  }
}

export async function processNotificationOutbox(limit = 20) {
  await prisma.notificationOutbox.updateMany({
    where: {
      status: NotificationStatus.SENDING,
      updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    data: {
      status: NotificationStatus.FAILED,
      nextAttemptAt: new Date(),
      lastError: "Delivery lease expired before completion.",
    },
  });

  const jobs = await prisma.notificationOutbox.findMany({
    where: {
      status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] },
      nextAttemptAt: { lte: new Date() },
      attempts: { lt: 8 },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    const claimed = await prisma.notificationOutbox.updateMany({
      where: {
        id: job.id,
        status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] },
      },
      data: { status: NotificationStatus.SENDING },
    });
    if (claimed.count === 0) {
      continue;
    }

    try {
      const payload = payloadRecord(job.payload);
      if (job.channel === NotificationChannel.EMAIL) {
        await sendEmail(job.recipient, job.template, payload);
      } else {
        await sendTelegram(job.recipient, job.template, payload);
      }

      await prisma.notificationOutbox.update({
        where: { id: job.id },
        data: {
          status: NotificationStatus.SENT,
          attempts: { increment: 1 },
          sentAt: new Date(),
          lastError: null,
        },
      });
      sent += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const backoffMinutes = Math.min(12 * 60, 2 ** attempts);
      await prisma.notificationOutbox.update({
        where: { id: job.id },
        data: {
          status: NotificationStatus.FAILED,
          attempts,
          nextAttemptAt: new Date(Date.now() + backoffMinutes * 60 * 1000),
          lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        },
      });
      failed += 1;
    }
  }

  return { claimed: jobs.length, sent, failed };
}

export function scheduleNotificationOutboxProcessing() {
  after(async () => {
    try {
      await processNotificationOutbox(10);
    } catch (error) {
      console.error("[commerce/outbox] deferred delivery failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
