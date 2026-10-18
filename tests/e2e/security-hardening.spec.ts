import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  createPublishedProductFixture,
  cleanupProductFixture,
} from "./product-fixtures";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; code?: string; error: string };

type CheckoutOrderResponse = {
  orderNumber: string;
  paymentStatus: string;
  paymentConfirmationUrl: string | null;
  orderUrl: string;
};

function expectHeader(response: { headers(): Record<string, string> }, name: string, expected: RegExp | string) {
  const value = response.headers()[name.toLowerCase()];

  expect(value, `Missing response header ${name}`).toBeTruthy();
  if (expected instanceof RegExp) {
    expect(value).toMatch(expected);
    return;
  }

  expect(value).toBe(expected);
}

async function readApiResponse<T>(response: { text(): Promise<string> }) {
  const raw = await response.text();
  return {
    raw,
    parsed: JSON.parse(raw) as ApiResponse<T>,
  };
}

function uniquePhone() {
  const suffix = String(Date.now() % 1_000_000).padStart(6, "0");
  return `+7 (999) ${suffix.slice(0, 3)}-${suffix.slice(3, 5)}-${suffix.slice(5)}0`;
}

function checkoutHeaders(ip: string) {
  return {
    "Idempotency-Key": randomUUID(),
    "x-forwarded-for": ip,
  };
}

async function createOrder(request: APIRequestContext, productId: string) {
  const response = await request.post("/api/orders", {
    headers: checkoutHeaders(`198.51.100.${Math.floor(Math.random() * 100) + 1}`),
    data: {
      customerName: "Security Test Buyer",
      phone: uniquePhone(),
      email: "security@example.com",
      shippingMethod: "SELF_PICKUP",
      termsAccepted: true,
      comment: "Created by security e2e.",
      items: [
        {
          kind: "product",
          productId,
          quantity: 1,
        },
      ],
    },
  });
  const { raw, parsed } = await readApiResponse<CheckoutOrderResponse>(response);

  expect(response.ok(), `create order failed: ${raw}`).toBeTruthy();
  expect(parsed.ok).toBe(true);

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return parsed.data;
}

test("public order JSON and HTML keep internal notes private", async ({ page, request }) => {
  const product = await createPublishedProductFixture(page, { namePrefix: "Private notes E2E" });
  const shipmentNote = `internal-shipment-${randomUUID()}`;
  const statusNote = `internal-status-${randomUUID()}`;
  try {
    const order = await createOrder(request, product.id);
    const list = await page.request.get(`/api/admin/orders?q=${encodeURIComponent(order.orderNumber)}`);
    const { data: orders } = await list.json();
    const id = orders.find((item: { orderNumber: string }) => item.orderNumber === order.orderNumber).id;
    const shipment = await page.request.patch(`/api/admin/orders/${id}/shipment`, {
      data: { method: "SELF_PICKUP", price: 0, trackingNumber: "PUBLIC-TRACK", managerNote: shipmentNote },
    });
    expect(shipment.ok()).toBeTruthy();
    expect((await shipment.json()).data.managerNote).toBe(shipmentNote);
    const status = await page.request.patch(`/api/admin/orders/${id}/status`, {
      data: { status: "PROCESSING", note: statusNote },
    });
    expect(status.ok()).toBeTruthy();
    const admin = (await (await page.request.get(`/api/admin/orders?q=${encodeURIComponent(order.orderNumber)}`)).json()).data[0];
    expect(admin.shipment.managerNote).toBe(shipmentNote);
    expect(admin.statusHistory.some((entry: { note: string | null }) => entry.note === statusNote)).toBe(true);
    const token = new URL(order.orderUrl, "http://127.0.0.1:3100").pathname.split("/").at(-1);
    const publicResponse = await request.get(`/api/orders/${token}`);
    expect(publicResponse.ok()).toBeTruthy();
    const raw = await publicResponse.text();
    expect(raw).not.toContain("managerNote");
    expect(raw).not.toContain(shipmentNote);
    expect(raw).not.toContain(statusNote);
    const data = JSON.parse(raw).data;
    expect(data.shipment).toMatchObject({ status: "AWAITING_DETAILS", trackingNumber: "PUBLIC-TRACK" });
    expect(data.timeline).toContainEqual(expect.objectContaining({ status: "PROCESSING", note: null, createdAt: expect.any(String) }));
    const html = await (await request.get(`/order/${token}`)).text();
    expect(html).not.toContain(shipmentNote);
    expect(html).not.toContain(statusNote);
    expect(html).not.toContain("managerNote");
  } finally {
    await cleanupProductFixture(page, product);
  }
});

test("admin login rate limits repeated failures", async ({ request }) => {
  const email = `missing-${Date.now()}@seed-store.local`;
  const headers = { "x-forwarded-for": "203.0.113.41" };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post("/api/admin/login", {
      headers,
      data: {
        email,
        password: "wrong-password",
      },
    });

    expect(response.status()).toBe(401);
  }

  const limited = await request.post("/api/admin/login", {
    headers,
    data: {
      email,
      password: "wrong-password",
    },
  });

  expect(limited.status()).toBe(429);
  expectHeader(limited, "retry-after", /[1-9]\d*/);
});

test("checkout rejects abusive cart payloads before payment creation", async ({ request }) => {
  const missingName = await request.post("/api/orders", {
    headers: checkoutHeaders("198.51.100.51"),
    data: {
      phone: "+7 (999) 111-22-31",
      email: "security-missing-name@example.com",
      shippingMethod: "SELF_PICKUP",
      termsAccepted: true,
      items: [{ kind: "product", productId: "test-product", quantity: 1 }],
    },
  });
  const missingNameResult = await readApiResponse<CheckoutOrderResponse>(missingName);
  expect(missingName.status()).toBe(400);
  expect(missingNameResult.parsed.ok).toBe(false);
  expect(missingNameResult.parsed.ok ? undefined : missingNameResult.parsed.code).toBe("VALIDATION_ERROR");

  const missingEmail = await request.post("/api/orders", {
    headers: checkoutHeaders("198.51.100.54"),
    data: {
      customerName: "Security Test Buyer",
      phone: "+7 (999) 111-22-34",
      shippingMethod: "SELF_PICKUP",
      termsAccepted: true,
      items: [{ kind: "product", productId: "test-product", quantity: 1 }],
    },
  });
  const missingEmailResult = await readApiResponse<CheckoutOrderResponse>(missingEmail);
  expect(missingEmail.status()).toBe(400);
  expect(missingEmailResult.parsed.ok).toBe(false);
  expect(missingEmailResult.parsed.ok ? undefined : missingEmailResult.parsed.code).toBe(
    "VALIDATION_ERROR"
  );

  const invalidEmail = await request.post("/api/orders", {
    headers: checkoutHeaders("198.51.100.52"),
    data: {
      customerName: "Security Test Buyer",
      phone: "+7 (999) 111-22-32",
      email: "not-an-email",
      shippingMethod: "SELF_PICKUP",
      termsAccepted: true,
      items: [{ kind: "product", productId: "test-product", quantity: 1 }],
    },
  });
  const invalidEmailResult = await readApiResponse<CheckoutOrderResponse>(invalidEmail);
  expect(invalidEmail.status()).toBe(400);
  expect(invalidEmailResult.parsed.ok).toBe(false);
  expect(invalidEmailResult.parsed.ok ? undefined : invalidEmailResult.parsed.code).toBe("VALIDATION_ERROR");

  const oversizedItems = Array.from({ length: 31 }, (_, index) => ({
    kind: "product",
    productId: `test-product-${index}`,
    quantity: 1,
  }));

  const tooManyItems = await request.post("/api/orders", {
    headers: checkoutHeaders("198.51.100.53"),
    data: {
      customerName: "Security Test Buyer",
      phone: "+7 (999) 111-22-33",
      email: "security-abuse@example.com",
      shippingMethod: "SELF_PICKUP",
      termsAccepted: true,
      items: oversizedItems,
    },
  });

  expect(tooManyItems.status()).toBe(400);

  const tooLargeQuantity = await request.post("/api/orders", {
    headers: checkoutHeaders("198.51.100.54"),
    data: {
      customerName: "Security Test Buyer",
      phone: "+7 (999) 111-22-34",
      email: "security-quantity@example.com",
      shippingMethod: "SELF_PICKUP",
      termsAccepted: true,
      items: [
        {
          kind: "product",
          productId: "test-product",
          quantity: 100,
        },
      ],
    },
  });

  expect(tooLargeQuantity.status()).toBe(400);
});

test("checkout requires legal acceptance and limits local delivery to Voronezh", async ({
  request,
}) => {
  const baseData = {
    customerName: "Regional Guard Buyer",
    phone: "+7 (999) 111-22-35",
    email: "regional-guard@example.com",
    items: [{ kind: "product", productId: "test-product", quantity: 1 }],
  };

  const missingAcceptance = await request.post("/api/orders", {
    headers: checkoutHeaders("198.51.100.56"),
    data: {
      ...baseData,
      shippingMethod: "SELF_PICKUP",
    },
  });
  const missingAcceptanceResult =
    await readApiResponse<CheckoutOrderResponse>(missingAcceptance);
  expect(missingAcceptance.status()).toBe(400);
  expect(missingAcceptanceResult.parsed.ok).toBe(false);
  expect(
    missingAcceptanceResult.parsed.ok
      ? undefined
      : missingAcceptanceResult.parsed.code
  ).toBe("VALIDATION_ERROR");

  const outsideVoronezh = await request.post("/api/orders", {
    headers: checkoutHeaders("198.51.100.57"),
    data: {
      ...baseData,
      shippingMethod: "LOCAL_COURIER",
      address: "Москва, Красная площадь, дом 1",
      termsAccepted: true,
    },
  });
  const outsideVoronezhResult =
    await readApiResponse<CheckoutOrderResponse>(outsideVoronezh);
  expect(outsideVoronezh.status()).toBe(400);
  expect(outsideVoronezhResult.parsed.ok).toBe(false);
  expect(
    outsideVoronezhResult.parsed.ok
      ? undefined
      : outsideVoronezhResult.parsed.code
  ).toBe("DELIVERY_OUTSIDE_VORONEZH");
});

test("checkout reuses an idempotent order and rejects a changed payload", async ({ page, request }) => {
  const product = await createPublishedProductFixture(page, {
    namePrefix: "Security Idempotency E2E Product",
  });
  const idempotencyKey = randomUUID();
  const headers = {
    "Idempotency-Key": idempotencyKey,
    "x-forwarded-for": "198.51.100.55",
  };
  const payload = {
    customerName: "Idempotency Test Buyer",
    phone: uniquePhone(),
    email: "idempotency@example.com",
    shippingMethod: "SELF_PICKUP",
    termsAccepted: true,
    comment: "Created by idempotency e2e.",
    items: [{ kind: "product", productId: product.id, quantity: 1 }],
  };

  try {
    const firstResponse = await request.post("/api/orders", { headers, data: payload });
    const first = await readApiResponse<CheckoutOrderResponse>(firstResponse);
    expect(firstResponse.ok(), `first checkout failed: ${first.raw}`).toBeTruthy();
    expect(first.parsed.ok).toBe(true);

    const retryResponse = await request.post("/api/orders", { headers, data: payload });
    const retry = await readApiResponse<CheckoutOrderResponse>(retryResponse);
    expect(retryResponse.ok(), `idempotent retry failed: ${retry.raw}`).toBeTruthy();
    expect(retry.parsed.ok).toBe(true);

    if (first.parsed.ok && retry.parsed.ok) {
      expect(retry.parsed.data.orderNumber).toBe(first.parsed.data.orderNumber);
      expect(retry.parsed.data.orderUrl).toBe(first.parsed.data.orderUrl);
    }

    const conflictResponse = await request.post("/api/orders", {
      headers,
      data: { ...payload, comment: "A different checkout comment" },
    });
    const conflict = await readApiResponse<CheckoutOrderResponse>(conflictResponse);
    expect(conflictResponse.status()).toBe(409);
    expect(conflict.parsed.ok).toBe(false);
    expect(conflict.parsed.ok ? undefined : conflict.parsed.code).toBe("IDEMPOTENCY_CONFLICT");
  } finally {
    await cleanupProductFixture(page, product);
  }
});

test("payment result uses opaque token and refresh requires a valid token", async ({ page, request }) => {
  const product = await createPublishedProductFixture(page, {
    namePrefix: "Security Result Token E2E Product",
  });

  try {
    const order = await createOrder(request, product.id);
    const paymentConfirmationUrl = order.paymentConfirmationUrl;
    expect(paymentConfirmationUrl).toBeTruthy();
    if (!paymentConfirmationUrl) {
      throw new Error("Checkout did not return a payment confirmation URL.");
    }
    const confirmationUrl = new URL(paymentConfirmationUrl);
    const orderUrl = new URL(order.orderUrl, "http://127.0.0.1:3000");
    const token = orderUrl.pathname.split("/").at(-1) ?? null;

    expect(token).toBeTruthy();
    expect(confirmationUrl.searchParams.get("orderId")).toBeNull();
    expect(orderUrl.searchParams.get("orderId")).toBeNull();
    expect(JSON.stringify(order)).not.toContain('"id"');

    const invalidRefresh = await request.post("/api/payment/result/refresh", {
      data: { token: "not-a-real-token" },
    });
    expect(invalidRefresh.status()).toBe(404);

    const validRefresh = await request.post("/api/payment/result/refresh", {
      headers: {
        "x-forwarded-for": "198.51.100.77",
      },
      data: { token },
    });
    const { raw, parsed } = await readApiResponse<{ orderNumber: string; paymentStatus: string }>(validRefresh);

    expect(validRefresh.ok(), `refresh failed: ${raw}`).toBeTruthy();
    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.data.orderNumber).toBe(order.orderNumber);
      expect(parsed.data.paymentStatus).toBe(order.paymentStatus);
    }

    await page.goto(`/payment/result?token=${encodeURIComponent(token ?? "")}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByText(order.orderNumber)).toBeVisible();
  } finally {
    await cleanupProductFixture(page, product);
  }
});

test("webhook retries when an unknown payment cannot be verified with the provider", async ({ request }) => {
  const response = await request.post("/api/yookassa/webhook", {
    headers: {
      "x-forwarded-for": "198.51.100.88",
    },
    data: {
      type: "notification",
      event: "payment.succeeded",
      object: {
        id: "payment-not-linked-to-local-order",
      },
    },
  });

  const result = await readApiResponse<never>(response);
  expect(response.status()).toBe(500);
  expect(result.parsed.ok).toBe(false);
});

test("security headers are present on storefront and api responses", async ({ request }) => {
  const storefront = await request.get("/catalog");
  const api = await request.post("/api/yookassa/webhook", {
    headers: {
      "x-forwarded-for": "198.51.100.89",
    },
    data: {
      type: "notification",
      event: "payment.canceled",
      object: {
        id: "payment-not-linked-to-local-order-for-headers",
      },
    },
  });

  for (const response of [storefront, api]) {
    expectHeader(response, "x-content-type-options", "nosniff");
    expectHeader(response, "referrer-policy", "strict-origin-when-cross-origin");
    expectHeader(response, "x-frame-options", "DENY");
    expectHeader(response, "permissions-policy", /camera=\(\)/);
    expectHeader(response, "content-security-policy-report-only", /default-src 'self'/);
  }
});
