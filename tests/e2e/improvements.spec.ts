import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createPublishedProductFixture, cleanupProductFixture } from "./product-fixtures";
import { getTestOrderInventory, expireTestOrderReservations, createTestNotificationFailure, readTestNotification, deleteTestNotification } from "./test-database";
import { fillCheckoutForm } from "./checkout-utils";
import type { ProductRecord } from "../../src/shared/api/contracts";

function productInput(product: ProductRecord) {
  return { name: product.name, slug: product.slug, description: product.description,
    price: product.price, categoryId: product.categoryId, isPublished: product.isPublished,
    stock: product.stock, inventoryPolicy: product.inventoryPolicy };
}

async function patchProduct(page: Page, product: ProductRecord, changes: Record<string, unknown>) {
  const response = await page.request.patch(`/api/admin/catalog/products/${product.id}`, {
    headers: { "If-Match": `"${product.updatedAt}"` }, data: { ...productInput(product), ...changes },
  });
  if (response.ok()) Object.assign(product, (await response.json()).data);
  return response;
}

test("поздняя оплата после истечения резерва сохраняет товар для другого заказа", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { stock: 2, adminLoginIp: "198.51.100.187" });
  const create = async (suffix: number) => {
    const response = await page.request.post("/api/orders", {
      headers: { "Idempotency-Key": randomUUID(), "x-forwarded-for": `198.51.100.${suffix}` },
      data: { customerName: "Поздняя оплата", phone: `+799988800${suffix}`, email: "late@example.com", shippingMethod: "SELF_PICKUP", termsAccepted: true, items: [{ kind: "product", productId: product.id, quantity: 2 }] },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data;
  };
  try {
    const first = await create(87);
    await expireTestOrderReservations(first.orderNumber);
    const second = await create(88);
    expect(second.preorderPending).toBe(false);
    const firstAdmin = (await (await page.request.get(`/api/admin/orders?q=${first.orderNumber}`)).json()).data[0];
    const notify = (id: string) => page.request.post("/api/yookassa/webhook", { data: { type: "notification", event: "payment.succeeded", object: { id } } });
    expect((await notify(firstAdmin.yookassaPaymentId)).ok()).toBeTruthy();
    const inventory = await getTestOrderInventory(first.orderNumber, product.id);
    expect(inventory.product.stock).toBe(2);
    expect(inventory.reservations).toMatchObject([{ status: "COMMITTED", quantity: 0, backorderQuantity: 2 }]);
    const updated = (await (await page.request.get(`/api/admin/orders?q=${first.orderNumber}`)).json()).data[0];
    expect(updated.requiresStockReview).toBe(true);
    const secondAdmin = (await (await page.request.get(`/api/admin/orders?q=${second.orderNumber}`)).json()).data[0];
    expect((await notify(secondAdmin.yookassaPaymentId)).ok()).toBeTruthy();
    expect((await getTestOrderInventory(second.orderNumber, product.id)).product.stock).toBe(0);
  } finally { await cleanupProductFixture(page, product); }
});

test("сбой уведомления остаётся в очереди с диагностикой и задержкой повтора", async ({ request }) => {
  expect(process.env.RESEND_API_KEY ?? "").toBe("");
  const notification = await createTestNotificationFailure();
  try {
    expect((await request.get("/api/cron/commerce")).status()).toBe(401);
    const response = await request.get("/api/cron/commerce", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(response.ok()).toBeTruthy();
    const failed = await readTestNotification(notification.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toContain("not configured");
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  } finally { await deleteTestNotification(notification.id); }
});

test("задержанная отмена старого платежа не отменяет новый платёж и его резерв", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { stock: 10, adminLoginIp: "198.51.100.182" });
  try {
    const checkoutKey = randomUUID();
    const payload = { customerName: "Повтор оплаты", phone: "+79998880082", email: "retry@example.com", shippingMethod: "SELF_PICKUP", termsAccepted: true, items: [{ kind: "product", productId: product.id, quantity: 2 }] };
    const response = await page.request.post("/api/orders", {
      headers: { "Idempotency-Key": checkoutKey, "x-forwarded-for": "198.51.100.182" },
      data: payload,
    });
    expect(response.ok()).toBeTruthy();
    const checkout = (await response.json()).data;
    const api = checkout.orderUrl.replace("/order/", "/api/orders/");
    const readAdmin = async () => (await (await page.request.get(`/api/admin/orders?q=${checkout.orderNumber}`)).json()).data[0];
    const first = (await readAdmin()).yookassaPaymentId;
    expect(first).toBeTruthy();
    const notify = (paymentId: string, event: string) => page.request.post("/api/yookassa/webhook", { data: { type: "notification", event, object: { id: paymentId } } });
    expect((await notify(first, "payment.canceled")).ok()).toBeTruthy();
    expect((await page.request.post(`${api}/payment-attempts`)).ok()).toBeTruthy();
    const second = (await readAdmin()).yookassaPaymentId;
    expect(second).not.toBe(first);
    expect((await notify(first, "payment.canceled")).ok()).toBeTruthy();
    const current = (await (await page.request.get(api)).json()).data;
    expect((await readAdmin()).yookassaPaymentId).toBe(second);
    expect(current.paymentStatus).toBe("PENDING");
    expect((await getTestOrderInventory(checkout.orderNumber, product.id)).reservations).toMatchObject([{ status: "ACTIVE", quantity: 2 }]);
    expect((await notify(second, "payment.succeeded")).ok()).toBeTruthy();
    expect((await notify(second, "payment.succeeded")).ok()).toBeTruthy();
    const inventory = await getTestOrderInventory(checkout.orderNumber, product.id);
    expect(inventory.product.stock).toBe(8);
    expect(inventory.movements.filter(item => item.reason === "SALE")).toHaveLength(1);
    expect((await page.request.patch(`/api/admin/orders/${(await readAdmin()).id}/status`, { data: { status: "CANCELLED" } })).ok()).toBeTruthy();
    const repeated = await page.request.post("/api/orders", { headers: { "Idempotency-Key": checkoutKey }, data: payload });
    expect(repeated.status()).toBe(409);
    expect((await repeated.json()).code).toBe("ORDER_CANCELLED");
    expect((await readAdmin()).yookassaPaymentId).toBe(second);
  } finally { await cleanupProductFixture(page, product); }
});

test("ошибка проверки корзины предлагает повтор без потери товаров", async ({ page }) => {
  await page.goto("/catalog");
  await page.getByTestId("add-to-cart-button").first().click();
  await page.route("**/api/cart/quote", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "CART_CHECK_FAILED", error: "Не удалось проверить цены и наличие." }) }));
  await page.goto("/cart");
  await expect(page.getByTestId("cart-review")).toContainText("Не удалось проверить");
  await expect(page.getByTestId("cart-item")).toHaveCount(1);
  await expect(page.getByTestId("cart-checkout")).toHaveAttribute("aria-disabled", "true");
  await page.unroute("**/api/cart/quote");
  await page.getByRole("button", { name: "Повторить проверку" }).click();
  await expect(page.getByTestId("cart-checkout")).toHaveAttribute("aria-disabled", "false");
});

test("изменение цены перед отправкой требует проверки новой суммы и сохраняет контакты", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { price: 99, adminLoginIp: "198.51.100.189" });
  try {
    await page.goto(`/product/${product.slug}`);
    await page.getByTestId("product-add-to-cart").click();
    await page.goto("/checkout");
    await fillCheckoutForm(page, { phone: "+79998880089" });
    await expect(page.getByTestId("checkout-submit")).toBeEnabled();
    expect((await patchProduct(page, product, { price: 199 })).ok()).toBeTruthy();
    let orders = 0;
    page.on("request", request => { if (request.url().endsWith("/api/orders") && request.method() === "POST") orders++; });
    await page.getByTestId("checkout-submit").click();
    await expect(page.locator("main [role=alert]")).toContainText("Данные товаров изменились");
    expect(orders).toBe(0);
    await expect(page.getByTestId("checkout-name")).toHaveValue("Тестовый покупатель");
    await expect(page.getByTestId("checkout-phone")).toHaveValue("+7 (999) 888-00-89");
    await expect(page.getByTestId("checkout-terms")).toBeChecked();
    await expect(page.getByText("199 ₽", { exact: true }).first()).toBeVisible();
  } finally { await cleanupProductFixture(page, product); }
});

test("корзина обновляет цену и наличие, скрытый товар можно убрать до оформления", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const product = await createPublishedProductFixture(page, { price: 99, stock: 10, namePrefix: "Очень длинное название семян для проверки переноса и обновления корзины", adminLoginIp: "198.51.100.183" });
  try {
    await page.goto(`/product/${product.slug}`);
    await page.getByTestId("product-add-to-cart").click();
    expect((await patchProduct(page, product, { price: 149, stock: 0 })).ok()).toBeTruthy();
    await page.goto("/cart");
    await expect(page.getByTestId("cart-review")).toContainText("обновились");
    await expect(page.getByTestId("cart-item")).toContainText("149 ₽");
    await expect(page.getByTestId("cart-preorder-notice")).toBeVisible();
    await expect(page.getByTestId("cart-item").getByRole("link", { name: product.name })).toHaveAttribute("href", `/product/${product.slug}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await patchProduct(page, product, { isPublished: false })).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId("cart-review")).toContainText("больше недоступны");
    await expect(page.getByTestId("cart-checkout")).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: `Удалить недоступный товар: ${product.name}` }).click();
    await expect(page.getByTestId("cart-item")).toHaveCount(0);
  } finally { await cleanupProductFixture(page, product); }
});

test("проверка корзины не раскрывает скрытый товар и ограничивает размер запроса", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { adminLoginIp: "198.51.100.184" });
  try {
    expect((await patchProduct(page, product, { isPublished: false })).ok()).toBeTruthy();
    const response = await page.request.post("/api/cart/quote", { data: { items: [{ kind: "product", id: product.id }] } });
    expect((await response.json()).data).toEqual([{ itemKey: `product:${product.id}`, data: null }]);
    expect((await page.request.post("/api/cart/quote", { data: { items: Array.from({ length: 101 }, () => ({ kind: "product", id: product.id })) } })).status()).toBe(400);
  } finally { await cleanupProductFixture(page, product); }
});

test("потерянный ответ checkout и перезагрузка не создают второй заказ", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { adminLoginIp: "198.51.100.185" });
  let firstOrder: { orderNumber: string } | undefined;
  const keys: string[] = [];
  try {
    await page.goto(`/product/${product.slug}`);
    await page.getByTestId("product-add-to-cart").click();
    await page.goto("/checkout");
    await fillCheckoutForm(page, { phone: "+79998880085", email: "lost-response@example.com" });
    await page.route("**/api/orders", async route => {
      keys.push(route.request().headers()["idempotency-key"] ?? "");
      const response = await route.fetch({ headers: { ...route.request().headers(), "x-forwarded-for": "198.51.100.185" } });
      expect(response.ok()).toBeTruthy();
      firstOrder = (await response.json()).data;
      await route.abort("failed");
    });
    await page.getByTestId("checkout-submit").click();
    await expect.poll(() => firstOrder?.orderNumber, { timeout: 10000 }).toBeTruthy();
    await expect(page.locator("main [role=alert]")).toBeVisible();
    await page.unroute("**/api/orders");
    await page.reload();
    await fillCheckoutForm(page, { phone: "+79998880085", email: "lost-response@example.com" });
    page.on("request", request => { if (request.url().endsWith("/api/orders") && request.method() === "POST") keys.push(request.headers()["idempotency-key"] ?? ""); });
    await page.getByTestId("checkout-submit").click();
    await expect(page.getByRole("heading", { name: "Переходим к оплате" })).toBeVisible();
    await expect(page.getByText(`Номер заказа: ${firstOrder!.orderNumber}`)).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[A-Za-z0-9:_-]{16,128}$/);
    expect(keys[1]).toBe(keys[0]);
    const stored = await page.evaluate(() => sessionStorage.getItem("seed-store-checkout-attempt-v1"));
    expect(stored).not.toContain("lost-response@example.com");
    expect(Object.keys(JSON.parse(stored!)).sort()).toEqual(["fingerprint", "key", "orderNumber", "orderUrl"]);
    const order = (await (await page.request.get(`/api/admin/orders?q=${firstOrder!.orderNumber}`)).json()).data[0];
    expect((await page.request.post("/api/yookassa/webhook", { data: { type: "notification", event: "payment.succeeded", object: { id: order.yookassaPaymentId } } })).ok()).toBeTruthy();
    await page.getByRole("link", { name: "Открыть заказ и повторить оплату" }).click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("seed-store-checkout-attempt-v1"))).toBeNull();
  } finally { await cleanupProductFixture(page, product); }
});

for (const width of [1440, 390]) {
  test(`товар возвращает к результатам поиска с фильтрами на ширине ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const catalog = "/catalog?q=томат&sort=price-desc";
    await page.goto(catalog);
    await page.locator('main a[href^="/product/"]').first().click();
    const link = page.getByRole("link", { name: "Вернуться к результатам" });
    await expect(link).toHaveAttribute("href", /q=.*sort=price-desc/);
    await link.click();
    await expect(page).toHaveURL(/\/catalog\?q=.*sort=price-desc/);
    await page.goto("/product/demo-tomato-1?returnTo=https%3A%2F%2Fevil.invalid");
    await expect(page.getByRole("link", { name: "Вернуться к результатам" })).toHaveCount(0);
  });
}

for (const [route, field] of [["products", "admin-product-name"], ["sets", "admin-seed-set-name"]] as const) {
  test(`редактор ${route} предупреждает при уходе с несохранёнными правками`, async ({ page }) => {
    expect((await page.request.post("/api/admin/login", { headers: { "x-forwarded-for": "198.51.100.186" }, data: { email: "admin@seed-store.local", password: "change-me" } })).ok()).toBeTruthy();
    await page.goto(`/admin/catalog/${route}/new`);
    await page.getByTestId(field).fill("Несохранённый товар или набор");
    let dialogs = 0;
    page.on("dialog", async dialog => { dialogs++; await dialog.dismiss(); });
    const leave = page.getByRole("link", { name: route === "sets" ? "Закрыть" : "Отмена", exact: true }).first();
    await leave.click();
    await expect(page.getByTestId(field)).toHaveValue("Несохранённый товар или набор");
    expect(dialogs).toBe(1);
    await page.getByRole("link", { name: "Заказы", exact: true }).first().click();
    await expect(page.getByTestId(field)).toHaveValue("Несохранённый товар или набор");
    expect(dialogs).toBe(2);
    page.removeAllListeners("dialog");
    page.once("dialog", dialog => dialog.accept());
    await leave.click();
    await expect(page).toHaveURL(/\/admin\/catalog\?tab=/);
  });
}
