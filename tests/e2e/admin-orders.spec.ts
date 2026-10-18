import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./admin-utils";
import {
  createPublishedProductFixture,
  cleanupProductFixture,
} from "./product-fixtures";

test("неавторизованный доступ к admin перенаправляет на login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("API admin orders без сессии отвечает 401", async ({ request }) => {
  const response = await request.get("/api/admin/orders");
  expect(response.status()).toBe(401);

  await expect(response.json()).resolves.toMatchObject({ ok: false });
});

test("администратор может изменить статус заказа", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { namePrefix: "Order status E2E" });
  try {
  const response = await page.request.post("/api/orders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { customerName: "E2E status buyer", phone: "+79990000001", email: "status@example.com",
      shippingMethod: "SELF_PICKUP", termsAccepted: true,
      items: [{ kind: "product", productId: product.id, quantity: 1 }] },
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  await page.goto(`/admin/orders?q=${encodeURIComponent(result.data.orderNumber)}`);

  const orderCard = page.getByTestId("admin-order-card").first();
  await expect(orderCard).toBeVisible();

  const statusSelect = orderCard.getByTestId("admin-order-status");
  const initialStatus = await statusSelect.inputValue();
  expect(initialStatus).toBe("NEW");
  const nextStatus = "PROCESSING";

  await statusSelect.selectOption(nextStatus);
  await orderCard.getByTestId("admin-save-status").click();

  await expect(statusSelect).toHaveValue(nextStatus);
  } finally {
    await cleanupProductFixture(page, product);
  }
});

test("администратор возвращает полную оплату отмененного заказа через YooKassa", async ({ page }) => {
  const product = await createPublishedProductFixture(page, {
    namePrefix: "Refund E2E Product",
    price: 149,
    stock: 4,
  });

  try {
    const checkoutResponse = await page.request.post("/api/orders", {
      headers: {
        "Idempotency-Key": randomUUID(),
        "x-forwarded-for": "198.51.100.131",
      },
      data: {
        customerName: "Refund Test Buyer",
        phone: "+7 (999) 333-44-55",
        email: "refund@example.com",
        shippingMethod: "SELF_PICKUP",
        termsAccepted: true,
        items: [{ kind: "product", productId: product.id, quantity: 1 }],
      },
    });
    const checkout = await checkoutResponse.json();
    expect(checkoutResponse.ok(), JSON.stringify(checkout)).toBeTruthy();
    const orderNumber = checkout.data.orderNumber as string;

    await loginAsAdmin(page);
    const ordersResponse = await page.request.get(
      `/api/admin/orders?q=${encodeURIComponent(orderNumber)}`
    );
    const ordersPayload = await ordersResponse.json();
    const order = ordersPayload.data[0] as { id: string; yookassaPaymentId: string };
    expect(order.yookassaPaymentId).toBeTruthy();

    const webhookResponse = await page.request.post("/api/yookassa/webhook", {
      headers: { "x-forwarded-for": "198.51.100.132" },
      data: {
        type: "notification",
        event: "payment.succeeded",
        object: { id: order.yookassaPaymentId },
      },
    });
    expect(webhookResponse.ok(), await webhookResponse.text()).toBeTruthy();

    const cancelResponse = await page.request.patch(`/api/admin/orders/${order.id}/status`, {
      data: { status: "CANCELLED", note: "Отмена для проверки возврата" },
    });
    expect(cancelResponse.ok(), await cancelResponse.text()).toBeTruthy();

    const refundResponse = await page.request.post(`/api/admin/orders/${order.id}/refund`, {
      data: { reason: "Полный тестовый возврат" },
    });
    const refund = await refundResponse.json();
    expect(refundResponse.ok(), JSON.stringify(refund)).toBeTruthy();
    expect(refund.data).toMatchObject({
      paymentStatus: "REFUNDED",
      refundStatus: "succeeded",
      fullRefund: true,
    });

    const refreshedOrders = await page.request.get(
      `/api/admin/orders?q=${encodeURIComponent(orderNumber)}`
    );
    const refreshedPayload = await refreshedOrders.json();
    expect(refreshedPayload.data[0]).toMatchObject({
      fulfillmentStatus: "CANCELLED",
      paymentStatus: "REFUNDED",
      requiresPaymentReview: false,
    });

    const productsResponse = await page.request.get(
      `/api/admin/catalog/products?q=${encodeURIComponent(product.slug)}`
    );
    const productsPayload = await productsResponse.json();
    expect(productsPayload.data[0].stock).toBe(4);

    await page.goto(`/admin/orders?q=${encodeURIComponent(orderNumber)}`);
    const orderCard = page.getByTestId("admin-order-card").filter({ hasText: orderNumber });
    await expect(orderCard.getByText("Деньги возвращены", { exact: true })).toBeVisible();
    await expect(orderCard.getByText("Полный возврат выполнен через YooKassa.")).toBeVisible();
  } finally {
    await cleanupProductFixture(page, product);
  }
});
