import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createPublishedProductFixture as createFixture, cleanupProductFixture } from "./product-fixtures";
import { fillCheckoutForm } from "./checkout-utils";
import { deleteTestSeedSetFixture, getTestOrderInventory } from "./test-database";

function createPublishedProductFixture(page: Page, options: Parameters<typeof createFixture>[1]) {
  // Keep this suite's logins separate from other suites' rate-limit budgets.
  return createFixture(page, { ...options, adminLoginIp: "198.51.100.171" });
}

async function createOrder(page: Page, productId: string, quantity: number, suffix: number) {
  const key = randomUUID();
  const response = await page.request.post("/api/orders", {
    headers: { "Idempotency-Key": key, "x-forwarded-for": `198.51.100.${suffix}` },
    data: {
      customerName: "Покупатель под заказ", phone: `+7 (999) 888-00-${suffix}`,
      email: "preorder@example.com", shippingMethod: "SELF_PICKUP", termsAccepted: true,
      items: [{ kind: "product", productId, quantity }],
    },
  });
  const payload = await response.json();
  expect(response.ok(), JSON.stringify(payload)).toBeTruthy();
  return payload.data as { orderNumber: string; orderUrl: string; preorderPending: boolean; paymentConfirmationUrl: string | null };
}

test("кнопка Под заказ, корзина и checkout сохраняют превышение после перезагрузки", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { stock: 2 });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/product/${product.slug}`);
    await page.getByTestId("product-preorder-button").click();
    await expect(page.getByTestId("product-quantity-input")).toHaveValue("3");
    await page.getByTestId("product-quantity-input").fill("100");
    await page.getByTestId("product-quantity-input").press("Enter");
    await expect(page.getByTestId("product-quantity-input")).toHaveValue("99");
    await page.getByTestId("product-quantity-input").fill("5");
    await expect(page.getByTestId("product-preorder-notice")).toContainText("3 ед. — под заказ");
    await page.screenshot({ path: ".codex-tmp/preorder-product-mobile.png", fullPage: true });
    await page.getByTestId("product-add-to-cart").click();
    await page.goto("/cart");
    await expect(page.getByTestId("cart-qty")).toHaveText("5");
    await page.getByTestId("cart-qty-increase").click();
    await page.reload();
    await expect(page.getByTestId("cart-qty")).toHaveText("6");
    await expect(page.getByTestId("cart-preorder-notice")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto("/checkout");
    await fillCheckoutForm(page, { phone: "+7 (999) 888-00-61" });
    await expect(page.getByTestId("checkout-submit")).toHaveText(/Оформить под заказ/);
    await page.getByTestId("checkout-submit").click();
    await expect(page.getByRole("heading", { name: "Заказ принят", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Открыть заказ", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Согласуем срок поставки" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Оплатить заказ", exact: true })).toHaveCount(0);
  } finally { await cleanupProductFixture(page, product); }
});

test("согласование в админке разрешает оплату, повторные события и возврат учитывают только склад", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { stock: 2 });
  try {
    const checkout = await createOrder(page, product.id, 5, 62);
    expect(checkout.preorderPending).toBe(true);
    let inventory = await getTestOrderInventory(checkout.orderNumber, product.id);
    expect(inventory.product.stock).toBe(2);
    expect(inventory.reservations).toMatchObject([{ quantity: 2, backorderQuantity: 3, status: "ACTIVE" }]);
    const publicApi = checkout.orderUrl.replace("/order/", "/api/orders/");
    const blocked = await page.request.post(`${publicApi}/payment-attempts`);
    expect((await blocked.json()).data).toMatchObject({ paymentConfirmationUrl: null, canRetryPayment: false });
    await page.goto(`/admin/orders?q=${checkout.orderNumber}`);
    const card = page.getByTestId("admin-order-card");
    await expect(card).toContainText("Нужно поставить:");
    await page.screenshot({ path: ".codex-tmp/preorder-admin-pending.png", fullPage: true });
    await card.getByTestId("admin-preorder-note").fill("До 15 октября, согласовано по телефону");
    await card.getByTestId("admin-confirm-preorder").click();
    await expect(card.getByText("Под заказ · срок подтверждён", { exact: true })).toBeVisible();
    await page.screenshot({ path: ".codex-tmp/preorder-admin-desktop.png", fullPage: true });
    const approved = await page.request.get(publicApi);
    expect((await approved.json()).data).toMatchObject({ preorderPending: false, canRetryPayment: true, preorderNote: "До 15 октября, согласовано по телефону" });
    const payment = await page.request.post(`${publicApi}/payment-attempts`);
    expect((await payment.json()).data.paymentConfirmationUrl).toBeTruthy();
    const orders = await page.request.get(`/api/admin/orders?q=${checkout.orderNumber}`);
    const order = (await orders.json()).data[0];
    const paidEvent = { type: "notification", event: "payment.succeeded", object: { id: order.yookassaPaymentId } };
    for (let i = 0; i < 2; i++) {
      const response = await page.request.post("/api/yookassa/webhook", { data: paidEvent });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    inventory = await getTestOrderInventory(checkout.orderNumber, product.id);
    expect(inventory.product.stock).toBe(0);
    expect(inventory.movements.filter((m) => m.reason === "SALE")).toMatchObject([{ delta: -2 }]);
    const canceled = await page.request.patch(`/api/admin/orders/${order.id}/status`, { data: { status: "CANCELLED" } });
    expect(canceled.ok()).toBe(true);
    const refund = await page.request.post(`/api/admin/orders/${order.id}/refund`, { data: { reason: "Возврат под заказ" } });
    const refunded = await refund.json();
    expect(refund.ok(), JSON.stringify(refunded)).toBe(true);
    const repeatedRefunds = await Promise.all([0, 1].map(() => page.request.post("/api/yookassa/webhook", { data: {
        type: "notification", event: "refund.succeeded", object: { id: refunded.data.refundId },
      } })));
    for (const event of repeatedRefunds) expect(event.ok(), await event.text()).toBe(true);
    const late = await page.request.post("/api/yookassa/webhook", { data: paidEvent });
    expect(late.ok()).toBe(true);
    inventory = await getTestOrderInventory(checkout.orderNumber, product.id);
    expect(inventory.product.stock).toBe(2);
    expect(inventory.movements.filter((m) => m.reason === "RETURN")).toMatchObject([{ delta: 2 }]);
    expect((await (await page.request.get(publicApi)).json()).data.paymentStatus).toBe("REFUNDED");
  } finally { await cleanupProductFixture(page, product); }
});

test("под заказ учитывает общий расход товара отдельно и внутри набора", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { stock: 2 });
  let seedSetId: string | undefined;
  try {
    const slug = `preorder-set-${randomUUID()}`;
    const created = await page.request.post("/api/admin/catalog/seed-sets", { data: {
      name: "Набор под заказ", slug, description: "Набор для проверки совместного резерва",
      imageUrl: "/sets/salad-season.webp", price: 299, items: [{ productId: product.id }],
    } });
    const set = (await created.json()).data;
    expect(created.ok()).toBe(true);
    seedSetId = set.id;
    const published = await page.request.post(`/api/admin/catalog/seed-sets/${seedSetId}/publish`);
    expect(published.ok(), await published.text()).toBe(true);
    await page.goto(`/sets/${slug}`);
    await page.getByTestId("add-seed-set-button").click();
    await page.goto("/cart");
    await page.getByTestId("cart-qty-increase").click();
    await page.getByTestId("cart-qty-increase").click();
    await expect(page.getByTestId("cart-preorder-notice")).toBeVisible();
    const response = await page.request.post("/api/orders", {
      headers: { "Idempotency-Key": randomUUID(), "x-forwarded-for": "198.51.100.168" },
      data: { customerName: "Покупатель набора", phone: "+7 (999) 888-00-68", email: "set-preorder@example.com",
        shippingMethod: "SELF_PICKUP", termsAccepted: true,
        items: [{ kind: "product", productId: product.id, quantity: 2 }, { kind: "seedSet", seedSetId, quantity: 2 }],
      },
    });
    const checkout = (await response.json()).data;
    expect(response.ok()).toBe(true);
    expect(checkout.preorderPending).toBe(true);
    const inventory = await getTestOrderInventory(checkout.orderNumber, product.id);
    expect(inventory.reservations).toMatchObject([{ quantity: 2, backorderQuantity: 2 }]);
    const order = (await (await page.request.get(checkout.orderUrl.replace("/order/", "/api/orders/"))).json()).data;
    expect(order.items.every((item: { isPreorder: boolean }) => item.isPreorder)).toBe(true);
  } finally {
    if (seedSetId) await deleteTestSeedSetFixture(seedSetId);
    await cleanupProductFixture(page, product);
  }
});

test("подтверждение сроков требует авторизации администратора", async ({ request }) => {
  const response = await request.post("/api/admin/orders/unknown/preorder", { data: { note: "До 15 октября" } });
  expect(response.status()).toBe(401);
});

test("отмена неоплаченного заказа освобождает резерв без возвратного движения", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { stock: 2 });
  try {
    const checkout = await createOrder(page, product.id, 5, 69);
    const order = (await (await page.request.get(`/api/admin/orders?q=${checkout.orderNumber}`)).json()).data[0];
    expect((await page.request.patch(`/api/admin/orders/${order.id}/status`, { data: { status: "CANCELLED" } })).ok()).toBe(true);
    const inventory = await getTestOrderInventory(checkout.orderNumber, product.id);
    expect(inventory.product.stock).toBe(2);
    expect(inventory.movements).toHaveLength(0);
    expect(inventory.reservations[0]?.status).toBe("RELEASED");
    expect((await page.request.post(`${checkout.orderUrl.replace("/order/", "/api/orders/")}/payment-attempts`)).status()).toBe(409);
  } finally { await cleanupProductFixture(page, product); }
});

test("UNLIMITED не требует согласования и не резервирует склад", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { stock: 0, inventoryPolicy: "UNLIMITED" });
  try {
    const checkout = await createOrder(page, product.id, 20, 70);
    expect(checkout.preorderPending).toBe(false);
    expect(checkout.paymentConfirmationUrl).toBeTruthy();
    const inventory = await getTestOrderInventory(checkout.orderNumber, product.id);
    expect(inventory.reservations).toHaveLength(0);
  } finally { await cleanupProductFixture(page, product); }
});

for (const inventoryPolicy of ["TRACKED", "PREORDER"] as const) {
  test(`нулевой остаток ${inventoryPolicy} доступен под заказ и не создаёт списаний`, async ({ page }) => {
    const product = await createPublishedProductFixture(page, { stock: 0, inventoryPolicy });
    try {
      await page.goto(`/product/${product.slug}`);
      await expect(page.getByTestId("product-add-to-cart")).toBeEnabled();
      await expect(page.getByTestId("product-preorder-notice")).toBeVisible();
      const checkout = await createOrder(page, product.id, 3, inventoryPolicy === "TRACKED" ? 63 : 64);
      expect(checkout.preorderPending).toBe(true);
      expect(checkout.paymentConfirmationUrl).toBeNull();
      const inventory = await getTestOrderInventory(checkout.orderNumber, product.id);
      expect(inventory.movements).toHaveLength(0);
      if (inventoryPolicy === "TRACKED") expect(inventory.reservations).toMatchObject([{ quantity: 0, backorderQuantity: 3 }]);
      else expect(inventory.reservations).toHaveLength(0);
    } finally { await cleanupProductFixture(page, product); }
  });
}

test("поступление под заказ списывается при сборке и возвращается однократно", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { stock: 0 });
  try {
    const checkout = await createOrder(page, product.id, 3, 65);
    const order = (await (await page.request.get(`/api/admin/orders?q=${checkout.orderNumber}`)).json()).data[0];
    const confirmation = await page.request.post(`/api/admin/orders/${order.id}/preorder`, { data: { note: "До 15 октября" } });
    expect(confirmation.ok()).toBe(true);
    const publicApi = checkout.orderUrl.replace("/order/", "/api/orders/");
    expect((await page.request.post(`${publicApi}/payment-attempts`)).ok()).toBe(true);
    const paidOrder = (await (await page.request.get(`/api/admin/orders?q=${checkout.orderNumber}`)).json()).data[0];
    expect((await page.request.post("/api/yookassa/webhook", { data: { type: "notification", event: "payment.succeeded", object: { id: paidOrder.yookassaPaymentId } } })).ok()).toBe(true);
    expect((await page.request.patch(`/api/admin/orders/${order.id}/status`, { data: { status: "PROCESSING" } })).ok()).toBe(true);
    const unavailable = await page.request.patch(`/api/admin/orders/${order.id}/status`, { data: { status: "PACKED" } });
    expect(unavailable.status()).toBe(409);
    expect((await unavailable.json()).code).toBe("BACKORDER_NOT_AVAILABLE");
    const stocked = await page.request.patch(`/api/admin/catalog/products/${product.id}/stock`, { data: { stock: 3, note: "Поступление под заказ" } });
    expect(stocked.ok(), await stocked.text()).toBe(true);
    for (let i = 0; i < 2; i++) expect((await page.request.patch(`/api/admin/orders/${order.id}/status`, { data: { status: "PACKED" } })).ok()).toBe(true);
    let inventory = await getTestOrderInventory(checkout.orderNumber, product.id);
    expect(inventory.product.stock).toBe(0);
    expect(inventory.movements.filter((m) => m.reason === "SALE")).toMatchObject([{ delta: -3 }]);
    expect(inventory.reservations).toMatchObject([{ quantity: 3, backorderQuantity: 0 }]);
    expect((await page.request.patch(`/api/admin/orders/${order.id}/status`, { data: { status: "CANCELLED" } })).ok()).toBe(true);
    for (let i = 0; i < 2; i++) expect((await page.request.post(`/api/admin/orders/${order.id}/refund`, { data: { reason: "Тестовый возврат" } })).ok()).toBe(true);
    inventory = await getTestOrderInventory(checkout.orderNumber, product.id);
    expect(inventory.product.stock).toBe(3);
    expect(inventory.movements.filter((m) => m.reason === "RETURN")).toMatchObject([{ delta: 3 }]);
  } finally { await cleanupProductFixture(page, product); }
});

test("заказ учитывает чужой резерв и требует нового согласования при увеличении нехватки", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { stock: 2 });
  try {
    const first = await createOrder(page, product.id, 1, 66);
    const second = await createOrder(page, product.id, 2, 67);
    expect(first.preorderPending).toBe(false);
    expect(second.preorderPending).toBe(true);
    expect((await getTestOrderInventory(second.orderNumber, product.id)).reservations).toMatchObject([{ quantity: 1, backorderQuantity: 1 }]);
    const order = (await (await page.request.get(`/api/admin/orders?q=${second.orderNumber}`)).json()).data[0];
    expect((await page.request.post(`/api/admin/orders/${order.id}/preorder`, { data: { note: "До 15 октября" } })).ok()).toBe(true);
    const stocked = await page.request.patch(`/api/admin/catalog/products/${product.id}/stock`, { data: { stock: 1, note: "Уточнение фактического остатка" } });
    expect(stocked.ok()).toBe(true);
    const retried = await page.request.post(`${second.orderUrl.replace("/order/", "/api/orders/")}/payment-attempts`);
    expect((await retried.json()).data).toMatchObject({ preorderPending: true, canRetryPayment: false, paymentConfirmationUrl: null });
  } finally { await cleanupProductFixture(page, product); }
});
