import "server-only";
import {
  NotificationChannel,
  type Prisma,
} from "@prisma/client";

type OutboxClient = Prisma.TransactionClient;

type OrderNotificationInput = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  email: string | null;
  phone: string;
  totalPrice: number;
  orderUrl: string;
};

function telegramRecipient() {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = (process.env.TELEGRAM_SELLER_CHAT_ID ?? "").trim();
  return token && chatId ? chatId : "";
}

function emailNotificationsEnabled() {
  return Boolean(
    (process.env.RESEND_API_KEY ?? "").trim() &&
      (process.env.EMAIL_FROM ?? "").trim()
  );
}

export async function enqueueOrderCreatedNotifications(
  tx: OutboxClient,
  input: OrderNotificationInput
) {
  const notifications: Prisma.NotificationOutboxCreateManyInput[] = [];

  if (input.email && emailNotificationsEnabled()) {
    notifications.push({
      orderId: input.orderId,
      channel: NotificationChannel.EMAIL,
      template: "order-created",
      recipient: input.email,
      deduplicationKey: `order-created:email:${input.orderId}`,
      payload: {
        orderNumber: input.orderNumber,
        customerName: input.customerName,
        totalPrice: input.totalPrice,
        orderUrl: input.orderUrl,
      },
    });
  }

  const sellerChatId = telegramRecipient();
  if (sellerChatId) {
    notifications.push({
      orderId: input.orderId,
      channel: NotificationChannel.TELEGRAM,
      template: "seller-order-created",
      recipient: sellerChatId,
      deduplicationKey: `order-created:telegram:${input.orderId}`,
      payload: {
        orderNumber: input.orderNumber,
        customerName: input.customerName,
        phone: input.phone,
        totalPrice: input.totalPrice,
      },
    });
  }

  if (notifications.length > 0) {
    await tx.notificationOutbox.createMany({ data: notifications, skipDuplicates: true });
  }
}

export async function enqueuePaymentSucceededNotifications(
  tx: OutboxClient,
  input: OrderNotificationInput
) {
  const notifications: Prisma.NotificationOutboxCreateManyInput[] = [];

  if (input.email && emailNotificationsEnabled()) {
    notifications.push({
      orderId: input.orderId,
      channel: NotificationChannel.EMAIL,
      template: "payment-succeeded",
      recipient: input.email,
      deduplicationKey: `payment-succeeded:email:${input.orderId}`,
      payload: {
        orderNumber: input.orderNumber,
        customerName: input.customerName,
        totalPrice: input.totalPrice,
        orderUrl: input.orderUrl,
      },
    });
  }

  const sellerChatId = telegramRecipient();
  if (sellerChatId) {
    notifications.push({
      orderId: input.orderId,
      channel: NotificationChannel.TELEGRAM,
      template: "seller-payment-succeeded",
      recipient: sellerChatId,
      deduplicationKey: `payment-succeeded:telegram:${input.orderId}`,
      payload: {
        orderNumber: input.orderNumber,
        customerName: input.customerName,
        phone: input.phone,
        totalPrice: input.totalPrice,
      },
    });
  }

  if (notifications.length > 0) {
    await tx.notificationOutbox.createMany({ data: notifications, skipDuplicates: true });
  }
}

export async function enqueueShipmentNotification(
  tx: OutboxClient,
  input: {
    orderId: string;
    orderNumber: string;
    email: string | null;
    trackingNumber: string | null;
    orderUrl: string;
  }
) {
  if (!input.email || !emailNotificationsEnabled()) {
    return;
  }

  await tx.notificationOutbox.createMany({
    data: [
      {
        orderId: input.orderId,
        channel: NotificationChannel.EMAIL,
        template: "order-shipped",
        recipient: input.email,
        deduplicationKey: `order-shipped:email:${input.orderId}:${input.trackingNumber ?? "no-tracking"}`,
        payload: {
          orderNumber: input.orderNumber,
          trackingNumber: input.trackingNumber,
          orderUrl: input.orderUrl,
        },
      },
    ],
    skipDuplicates: true,
  });
}
