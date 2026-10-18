import { randomUUID } from "node:crypto";
import { PaymentStatus } from "@prisma/client";
import { getYookassaCredentials } from "@/lib/env";
import { STORE_BRAND } from "@/shared/config/store";

const YOOKASSA_API_URL = "https://api.yookassa.ru/v3";

type YookassaPaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";
type YookassaRefundStatus = "pending" | "succeeded" | "canceled";

export type YookassaPayment = {
  id: string;
  status: YookassaPaymentStatus;
  paid: boolean;
  amount?: {
    value?: string;
    currency?: string;
  };
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
  metadata?: {
    orderId?: string;
    orderNumber?: string;
    paymentAttemptId?: string;
  };
};

export type YookassaRefund = {
  id: string;
  status: YookassaRefundStatus;
  payment_id: string;
  amount?: {
    value?: string;
    currency?: string;
  };
  cancellation_details?: {
    party?: string;
    reason?: string;
  };
};

const globalForYookassaE2E = globalThis as typeof globalThis & {
  yookassaE2EPayments?: Map<string, YookassaPayment>;
  yookassaE2ERefunds?: Map<string, YookassaRefund>;
};

function isYookassaE2EMockEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.YOOKASSA_E2E_MOCK === "1";
}

function getYookassaE2EPayments() {
  if (!globalForYookassaE2E.yookassaE2EPayments) {
    globalForYookassaE2E.yookassaE2EPayments = new Map();
  }

  return globalForYookassaE2E.yookassaE2EPayments;
}

function getYookassaE2ERefunds() {
  if (!globalForYookassaE2E.yookassaE2ERefunds) {
    globalForYookassaE2E.yookassaE2ERefunds = new Map();
  }

  return globalForYookassaE2E.yookassaE2ERefunds;
}

export function applyYookassaE2ENotification(paymentId: string, eventType: string) {
  if (!isYookassaE2EMockEnabled()) {
    return;
  }

  const payment = getYookassaE2EPayments().get(paymentId);
  if (!payment) {
    return;
  }

  if (eventType === "payment.succeeded") {
    payment.status = "succeeded";
    payment.paid = true;
  } else if (eventType === "payment.canceled") {
    payment.status = "canceled";
    payment.paid = false;
  } else if (eventType === "payment.waiting_for_capture") {
    payment.status = "waiting_for_capture";
    payment.paid = true;
  }
}

export type YookassaPaymentItem = {
  description: string;
  quantity: number;
  amountRub: number;
  paymentSubject?: "commodity" | "service";
};

type CreatePaymentInput = {
  orderId: string;
  orderNumber: string;
  paymentAttemptId: string;
  idempotencyKey: string;
  amountRub: number;
  returnUrl: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  items: YookassaPaymentItem[];
};

type ExpectedPaymentInput = {
  orderId: string;
  orderNumber: string;
  amountRub: number;
};

export class YookassaConfigError extends Error {
  constructor() {
    super("YooKassa credentials are not configured.");
  }
}

export class YookassaApiError extends Error {
  constructor(
    message = "YooKassa payment request failed.",
    readonly details?: unknown
  ) {
    super(message);
  }
}

function getAuthHeader() {
  const credentials = getYookassaCredentials();

  if (!credentials.isConfigured) {
    throw new YookassaConfigError();
  }

  return `Basic ${Buffer.from(`${credentials.shopId}:${credentials.secretKey}`).toString("base64")}`;
}

function formatAmountRub(value: number) {
  return value.toFixed(2);
}

function formatReceiptDescription(value: string) {
  const description = value.trim();

  return description.length > 128 ? description.slice(0, 128) : description;
}

function buildReceipt(input: CreatePaymentInput) {
  const customer: {
    full_name: string;
    phone: string;
    email?: string;
  } = {
    full_name: input.customerName,
    phone: input.customerPhone,
  };

  if (input.customerEmail) {
    customer.email = input.customerEmail;
  }

  return {
    customer,
    items: input.items.map((item) => ({
      description: formatReceiptDescription(item.description),
      quantity: item.quantity.toFixed(3),
      amount: {
        value: formatAmountRub(item.amountRub),
        currency: "RUB",
      },
      vat_code: 1,
      payment_mode: "full_prepayment",
      payment_subject: item.paymentSubject ?? "commodity",
    })),
  };
}

function normalizePayment(raw: unknown): YookassaPayment {
  if (!raw || typeof raw !== "object") {
    throw new YookassaApiError("YooKassa returned an unexpected payment response.");
  }

  const payment = raw as {
    id?: unknown;
    status?: unknown;
    paid?: unknown;
    amount?: unknown;
    confirmation?: unknown;
    metadata?: unknown;
  };

  if (typeof payment.id !== "string" || typeof payment.status !== "string") {
    throw new YookassaApiError("YooKassa payment response does not contain payment id or status.");
  }

  if (!["pending", "waiting_for_capture", "succeeded", "canceled"].includes(payment.status)) {
    throw new YookassaApiError("YooKassa returned an unsupported payment status.");
  }

  const confirmation =
    payment.confirmation && typeof payment.confirmation === "object"
      ? (payment.confirmation as YookassaPayment["confirmation"])
      : undefined;
  const amount =
    payment.amount && typeof payment.amount === "object"
      ? (payment.amount as YookassaPayment["amount"])
      : undefined;
  const metadata =
    payment.metadata && typeof payment.metadata === "object"
      ? (payment.metadata as YookassaPayment["metadata"])
      : undefined;

  const normalized: YookassaPayment = {
    id: payment.id,
    status: payment.status as YookassaPaymentStatus,
    paid: payment.paid === true,
  };

  if (confirmation) {
    normalized.confirmation = confirmation;
  }
  if (amount) {
    normalized.amount = amount;
  }
  if (metadata) {
    normalized.metadata = metadata;
  }

  return normalized;
}

function normalizeRefund(raw: unknown): YookassaRefund {
  if (!raw || typeof raw !== "object") {
    throw new YookassaApiError("YooKassa returned an unexpected refund response.");
  }

  const refund = raw as {
    id?: unknown;
    status?: unknown;
    payment_id?: unknown;
    amount?: unknown;
    cancellation_details?: unknown;
  };

  if (
    typeof refund.id !== "string" ||
    typeof refund.status !== "string" ||
    typeof refund.payment_id !== "string" ||
    !["pending", "succeeded", "canceled"].includes(refund.status)
  ) {
    throw new YookassaApiError("YooKassa refund response is incomplete.");
  }

  const normalized: YookassaRefund = {
    id: refund.id,
    status: refund.status as YookassaRefundStatus,
    payment_id: refund.payment_id,
  };

  if (refund.amount && typeof refund.amount === "object") {
    normalized.amount = refund.amount as NonNullable<YookassaRefund["amount"]>;
  }
  if (refund.cancellation_details && typeof refund.cancellation_details === "object") {
    normalized.cancellation_details =
      refund.cancellation_details as NonNullable<YookassaRefund["cancellation_details"]>;
  }

  return normalized;
}

function assertSucceededPaymentMatchesOrder(payment: YookassaPayment, expected: ExpectedPaymentInput) {
  if (payment.status !== "succeeded") {
    return;
  }

  if (!payment.paid) {
    throw new YookassaApiError("YooKassa payment is succeeded but not marked as paid.");
  }

  if (payment.amount?.value !== formatAmountRub(expected.amountRub) || payment.amount?.currency !== "RUB") {
    throw new YookassaApiError("YooKassa payment amount does not match the order.");
  }

  if (
    payment.metadata?.orderId !== expected.orderId ||
    payment.metadata?.orderNumber !== expected.orderNumber
  ) {
    throw new YookassaApiError("YooKassa payment metadata does not match the order.");
  }
}

export function mapYookassaPaymentStatus(status: YookassaPaymentStatus) {
  if (status === "waiting_for_capture") {
    return PaymentStatus.WAITING_FOR_CAPTURE;
  }

  if (status === "succeeded") {
    return PaymentStatus.SUCCEEDED;
  }

  if (status === "canceled") {
    return PaymentStatus.CANCELED;
  }

  return PaymentStatus.PENDING;
}

export function getYookassaPaymentUpdate(payment: YookassaPayment, expected: ExpectedPaymentInput) {
  assertSucceededPaymentMatchesOrder(payment, expected);
  const paymentStatus = mapYookassaPaymentStatus(payment.status);
  const update: {
    paymentStatus: PaymentStatus;
    paidAt?: Date;
    paymentUpdatedAt: Date;
  } = {
    paymentStatus,
    paymentUpdatedAt: new Date(),
  };

  if (paymentStatus === PaymentStatus.SUCCEEDED) {
    update.paidAt = new Date();
  }

  return update;
}

export async function createYookassaPayment(input: CreatePaymentInput) {
  if (isYookassaE2EMockEnabled()) {
    const payment: YookassaPayment = {
      id: `e2e-payment-${randomUUID()}`,
      status: "pending",
      paid: false,
      amount: {
        value: formatAmountRub(input.amountRub),
        currency: "RUB",
      },
      confirmation: {
        type: "redirect",
        confirmation_url: input.returnUrl,
      },
      metadata: {
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        paymentAttemptId: input.paymentAttemptId,
      },
    };
    getYookassaE2EPayments().set(payment.id, payment);

    return {
      payment,
      confirmationUrl: input.returnUrl,
    };
  }

  const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      amount: {
        value: formatAmountRub(input.amountRub),
        currency: "RUB",
      },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: input.returnUrl,
      },
      receipt: buildReceipt(input),
      description: `Оплата в магазине «${STORE_BRAND.name}»`,
      metadata: {
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        paymentAttemptId: input.paymentAttemptId,
      },
    }),
  });

  const raw = await response.json().catch(() => null);

  if (!response.ok) {
    throw new YookassaApiError("YooKassa could not create a payment.", {
      status: response.status,
      response: raw,
    });
  }

  const payment = normalizePayment(raw);
  const confirmationUrl = payment.confirmation?.confirmation_url;

  if (!confirmationUrl) {
    throw new YookassaApiError("YooKassa payment response does not contain confirmation url.");
  }

  return {
    payment,
    confirmationUrl,
  };
}

export async function getYookassaPayment(paymentId: string) {
  if (isYookassaE2EMockEnabled()) {
    const payment = getYookassaE2EPayments().get(paymentId);
    if (!payment) {
      throw new YookassaApiError("E2E payment does not exist.");
    }

    return payment;
  }

  const response = await fetch(`${YOOKASSA_API_URL}/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const raw = await response.json().catch(() => null);

  if (!response.ok) {
    throw new YookassaApiError("YooKassa could not return payment status.");
  }

  return normalizePayment(raw);
}

export async function createYookassaRefund(input: {
  paymentId: string;
  amountRub: number;
  idempotencyKey: string;
  description: string;
}) {
  if (isYookassaE2EMockEnabled()) {
    const refund: YookassaRefund = {
      id: `e2e-refund-${randomUUID()}`,
      status: "succeeded",
      payment_id: input.paymentId,
      amount: {
        value: formatAmountRub(input.amountRub),
        currency: "RUB",
      },
    };
    getYookassaE2ERefunds().set(refund.id, refund);
    return refund;
  }

  const response = await fetch(`${YOOKASSA_API_URL}/refunds`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      payment_id: input.paymentId,
      amount: {
        value: formatAmountRub(input.amountRub),
        currency: "RUB",
      },
      description: input.description.slice(0, 250),
    }),
  });

  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new YookassaApiError("YooKassa could not create a refund.", {
      status: response.status,
      response: raw,
    });
  }

  return normalizeRefund(raw);
}

export async function getYookassaRefund(refundId: string) {
  if (isYookassaE2EMockEnabled()) {
    const refund = getYookassaE2ERefunds().get(refundId);
    if (!refund) {
      throw new YookassaApiError("E2E refund does not exist.");
    }
    return refund;
  }

  const response = await fetch(`${YOOKASSA_API_URL}/refunds/${encodeURIComponent(refundId)}`, {
    method: "GET",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new YookassaApiError("YooKassa could not return refund status.");
  }

  return normalizeRefund(raw);
}
