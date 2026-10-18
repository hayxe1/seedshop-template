import { expect, test, type Page } from "@playwright/test";
import { createPublishedProductFixture, cleanupProductFixture } from "./product-fixtures";
import { fillCheckoutForm, submitCheckout } from "./checkout-utils";
import { deleteTestProductFixtures, getTestOrderInventory } from "./test-database";

const credentials = { email: "admin@seed-store.local", password: "change-me" };
test.beforeEach(async ({ page }, info) => {
  // Each browser scenario has its own request-rate budget on the disposable DB.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${20 + info.line % 200}` });
});
async function login(page: Page, ip: string) {
  expect((await page.request.post("/api/admin/login", { headers: { "x-forwarded-for": ip }, data: credentials })).ok()).toBeTruthy();
}
async function adminOrder(page: Page, number: string) {
  return (await (await page.request.get(`/api/admin/orders?q=${number}`)).json()).data[0];
}
async function paid(page: Page, number: string) {
  const order = await adminOrder(page, number);
  expect((await page.request.post("/api/yookassa/webhook", { data: { type: "notification", event: "payment.succeeded", object: { id: order.yookassaPaymentId } } })).ok()).toBeTruthy();
  return order;
}

for (const kind of ["products", "sets"] as const) {
  test(`черновик ${kind}: Назад, поиск, выход, истечение входа и успешное сохранение`, async ({ page, context }) => {
    const ip = kind === "products" ? "198.51.100.202" : "198.51.100.203";
    const field = kind === "products" ? "admin-product-name" : "admin-seed-set-name";
    const key = kind === "products" ? "seedshop-product-draft:new" : "seedshop-set-draft:new";
    const name = `Черновик ${kind} ${Date.now()}`;
    await login(page, ip);
    await page.goto("/admin/catalog");
    await page.locator(`a[href="/admin/catalog/${kind}/new"]`).first().click();
    await page.getByTestId(field).fill(name);
    await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), key)).toContain(name);
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/catalog$/);
    await page.locator(`a[href="/admin/catalog/${kind}/new"]`).first().click();
    await page.getByRole("button", { name: "Восстановить правки" }).click();
    await expect(page.getByTestId(field)).toHaveValue(name);
    let prompts = 0;
    page.on("dialog", async dialog => { prompts++; await dialog.dismiss(); });
    const search = page.getByRole("searchbox", { name: "Поиск по товарам и заказам" });
    await search.fill("Томат"); await search.press("Enter");
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    expect(prompts).toBe(2);
    await expect(page.getByTestId(field)).toHaveValue(name);
    expect((await page.request.get("/api/admin/catalog/categories")).ok()).toBeTruthy();
    // Real session expiration: draft survives the redirect and subsequent login.
    await context.clearCookies();
    page.removeAllListeners("dialog"); page.once("dialog", dialog => dialog.accept());
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/login/);
    await login(page, ip);
    await page.goto(`/admin/catalog/${kind}/new`);
    await page.getByRole("button", { name: "Восстановить правки" }).click();
    await expect(page.getByTestId(field)).toHaveValue(name);
    if (kind === "products") {
      await page.getByTestId("admin-product-description").fill("Описание восстановленного товара для проверки сохранения.");
      await page.getByTestId("admin-product-price").fill("149");
      await page.getByTestId("admin-drawer-save").click();
      await expect(page).toHaveURL(/\/admin\/catalog\?tab=products/);
    } else {
      await page.getByTestId("admin-seed-set-description").fill("Описание восстановленного демонстрационного набора.");
      await page.getByTestId("admin-seed-set-price").fill("199");
      await page.getByTestId("admin-seed-set-save").click();
      await expect(page.getByTestId("admin-catalog-notice")).toContainText("Черновик сохранён");
      // Further edits after a save still have draft protection.
      await page.getByTestId(field).fill(name + " новая правка");
      await expect.poll(() => page.evaluate(() => [...Array(sessionStorage.length)].map((_, i) => sessionStorage.getItem(sessionStorage.key(i)!)).join("\n"))).toContain("новая правка");
    }
    await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), key)).toBeNull();
  });
}

test("оплата в другой вкладке сохраняет новые товары и разрешает новую идентичную покупку", async ({ page, context }) => {
  const product = await createPublishedProductFixture(page, { stock: 10, adminLoginIp: "198.51.100.204" });
  const other = await createPublishedProductFixture(page, { stock: 10, adminLoginIp: "198.51.100.204" });
  const form = { phone: "+79998880104", email: "again@example.com" };
  const second = await context.newPage();
  try {
    await page.goto(`/product/${product.slug}`); await page.getByTestId("product-add-to-cart").click();
    await page.goto("/checkout"); await fillCheckoutForm(page, form);
    const firstNumber = await submitCheckout(page);
    const firstAttempt = await page.evaluate(() => JSON.parse(sessionStorage.getItem("seed-store-checkout-attempt-v1")!));
    await page.goto("/checkout"); await fillCheckoutForm(page, form);
    expect(await submitCheckout(page)).toBe(firstNumber);
    await second.goto(`/product/${other.slug}`); await second.getByTestId("product-add-to-cart").click();
    await second.goto(`/product/${product.slug}`); await second.getByTestId("product-add-to-cart").click();
    await paid(page, firstNumber);
    await second.goto(firstAttempt.orderUrl);
    await expect.poll(() => second.evaluate(() => localStorage.getItem("seed-store-pending-order-v1"))).toBeNull();
    await page.goto("/cart");
    await expect(page.getByTestId("cart-item")).toHaveCount(2);
    await expect(page.getByTestId("cart-qty")).toHaveText(["1", "1"]);
    await second.reload();
    await expect(page.getByTestId("cart-item")).toHaveCount(2);
    await page.getByTestId("cart-item").filter({ hasText: other.name }).getByRole("button", { name: "Удалить", exact: true }).click();
    await page.goto("/checkout"); await fillCheckoutForm(page, form);
    const nextNumber = await submitCheckout(page);
    expect(nextNumber).not.toBe(firstNumber);
    const nextKey = await page.evaluate(() => JSON.parse(sessionStorage.getItem("seed-store-checkout-attempt-v1")!).key);
    expect(nextKey).not.toBe(firstAttempt.key);
    const cancelled = await adminOrder(page, nextNumber);
    expect((await page.request.patch(`/api/admin/orders/${cancelled.id}/status`, { data: { status: "CANCELLED" } })).ok()).toBeTruthy();
    await page.goto("/checkout"); await fillCheckoutForm(page, form);
    expect(await submitCheckout(page)).not.toBe(nextNumber);
  } finally { await second.close(); await cleanupProductFixture(page, other); await cleanupProductFixture(page, product); }
});

test("новая покупка после возврата использует новый ключ", async ({ page }) => {
  const product = await createPublishedProductFixture(page, { stock: 10, adminLoginIp: "198.51.100.205" });
  const form = { phone: "+79998880105", email: "refunded-again@example.com" };
  try {
    await page.goto(`/product/${product.slug}`); await page.getByTestId("product-add-to-cart").click();
    await page.goto("/checkout"); await fillCheckoutForm(page, form);
    const first = await submitCheckout(page);
    const order = await paid(page, first);
    await page.request.patch(`/api/admin/orders/${order.id}/status`, { data: { status: "CANCELLED" } });
    expect((await page.request.post(`/api/admin/orders/${order.id}/refund`, { data: { reason: "Возврат тестового заказа" } })).ok()).toBeTruthy();
    await page.goto("/checkout"); await fillCheckoutForm(page, form);
    expect(await submitCheckout(page)).not.toBe(first);
  } finally { await cleanupProductFixture(page, product); }
});

test("мобильный каталог, размеры управления и оптовое количество в корзине", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog");
  await page.getByRole("link", { name: /К товарам/ }).click();
  expect(await page.locator("#catalog-results").evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(60);
  await page.getByTestId("add-to-cart-button").first().click();
  const plus = page.getByRole("button", { name: /Увеличить количество:/ }).first();
  const box = await plus.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  await page.goto("/cart");
  const quantity = page.getByTestId("cart-quantity-input");
  await quantity.fill("20"); await quantity.press("Enter");
  await expect(page.getByTestId("cart-qty")).toHaveText("20");
  await page.reload(); await expect(quantity).toHaveValue("20");
  await login(page, "198.51.100.206"); await page.goto("/admin/catalog");
  const header = await page.locator("main > section > header").boundingBox();
  expect(header!.y + header!.height).toBeLessThan(280);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("потерянный ответ уже оплаченного заказа не возвращает покупателя к оплате", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.207" });
  const product = await createPublishedProductFixture(page, { stock: 10, adminLoginIp: "198.51.100.207" });
  const form = { phone: "+79998880107", email: "paid-lost@example.com" };
  let number = "";
  const keys: string[] = [];
  try {
    await page.goto(`/product/${product.slug}`); await page.getByTestId("product-add-to-cart").click();
    await page.goto("/checkout"); await fillCheckoutForm(page, form);
    await page.route("**/api/orders", async route => {
      keys.push(route.request().headers()["idempotency-key"]!);
      const response = await route.fetch(); expect(response.ok(), await response.text()).toBeTruthy();
      number = (await response.json()).data.orderNumber;
      await paid(page, number);
      await route.abort("failed");
    });
    await page.getByTestId("checkout-submit").click();
    await expect(page.locator("main [role=alert]")).toBeVisible();
    await page.unroute("**/api/orders"); await page.reload(); await fillCheckoutForm(page, form);
    page.on("request", request => { if (request.url().endsWith("/api/orders") && request.method() === "POST") keys.push(request.headers()["idempotency-key"]!); });
    await page.getByTestId("checkout-submit").click();
    await expect(page.getByRole("heading", { name: "Заказ оплачен", exact: true })).toBeVisible();
    await expect(page.getByText(`Номер заказа: ${number}`)).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: /оплат/i })).toHaveCount(0);
    expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
    await page.getByRole("link", { name: "Открыть заказ", exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("seed-store-pending-order-v1"))).toBeNull();
    await page.goto("/cart"); await expect(page.getByTestId("cart-item")).toHaveCount(0);
  } finally { await cleanupProductFixture(page, product); }
});

test("мобильный путь продавца: публикация, оптовая покупка, согласование, поступление и сборка", async ({ page }) => {
  test.setTimeout(90000);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.208" });
  await page.setViewportSize({ width: 390, height: 844 });
  let slug = "";
  const name = `Томат для теплицы с подробным названием и фасовкой 20 семян ${Date.now()}`;
  let productId = "";
  try {
    await login(page, "198.51.100.208"); await page.goto("/admin/catalog");
    await page.getByTestId("admin-create-product").click();
    await page.getByTestId("admin-product-name").fill(name);
    await page.getByTestId("admin-product-description").fill("Проверка полного пути продавца и покупателя на телефоне.");
    await page.getByTestId("admin-product-price").fill("149");
    await page.getByLabel("Количество на складе").fill("2");
    await page.getByText("Выбрать из библиотеки изображений", { exact: true }).click();
    await page.getByTestId("admin-asset-select-main").first().click();
    await page.getByTestId("admin-product-visibility").selectOption("published");
    const saved = page.waitForResponse(response => response.url().endsWith("/api/admin/catalog/products") && response.request().method() === "POST");
    await page.getByTestId("admin-drawer-save").click();
    const record = (await (await saved).json()).data;
    slug = record.slug; productId = record.id;
    await expect(page.getByTestId(`admin-product-card-${slug}`)).toBeVisible();
    await page.goto(`/product/${slug}`);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByTestId("product-quantity-input").fill("5"); await page.getByTestId("product-add-to-cart").click();
    await page.goto("/cart"); await expect(page.getByTestId("cart-quantity-input")).toHaveValue("5");
    await page.goto("/checkout"); await fillCheckoutForm(page, { phone: "+79998880108", email: "seller-journey@example.com" });
    await page.getByTestId("checkout-submit").click();
    await expect(page.getByRole("heading", { name: "Заказ принят", exact: true })).toBeVisible();
    const number = (await page.getByText(/Номер заказа:/).textContent())!.match(/ORD-\d+/)![0];
    await page.getByRole("link", { name: "Открыть заказ", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Согласуем срок поставки" })).toBeVisible();
    const orderUrl = page.url();
    await page.goto(`/admin/orders?q=${number}`);
    const card = page.getByTestId("admin-order-card");
    await card.getByTestId("admin-preorder-note").fill("Три недостающие упаковки поступят через неделю, срок согласован.");
    await card.getByTestId("admin-confirm-preorder").click();
    await expect(card.getByText("Под заказ · срок подтверждён", { exact: true })).toBeVisible();
    await page.screenshot({ path: ".codex-tmp/improvement-stage2/after/manager-approved-mobile.png", fullPage: true });
    await page.goto(orderUrl); await page.getByRole("button", { name: "Оплатить заказ", exact: true }).click();
    await expect.poll(async () => (await adminOrder(page, number)).yookassaPaymentId).toBeTruthy();
    await paid(page, number); await page.reload();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("seed-store-pending-order-v1"))).toBeNull();
    await page.goto(`/admin/orders?q=${number}`);
    await card.getByTestId("admin-order-status").selectOption("PROCESSING"); await card.getByTestId("admin-save-status").click();
    await expect(card.getByTestId("admin-order-status")).toHaveValue("PROCESSING");
    await card.getByTestId("admin-order-status").selectOption("PACKED"); await card.getByTestId("admin-save-status").click();
    await expect(page.locator("main [role=alert]")).toBeVisible();
    await page.goto(`/admin/catalog/products/${productId}`);
    await page.getByLabel("Количество на складе").fill("3"); await page.getByTestId("admin-drawer-save").click();
    await expect(page).toHaveURL(/\/admin\/catalog\?tab=products/);
    await page.goto(`/admin/orders?q=${number}`);
    await card.getByTestId("admin-order-status").selectOption("PACKED"); await card.getByTestId("admin-save-status").click();
    await expect.poll(async () => (await adminOrder(page, number)).fulfillmentStatus).toBe("PACKED");
    const inventory = await getTestOrderInventory(number, productId);
    expect(inventory.product.stock).toBe(0);
    expect(inventory.movements.filter(m => m.reason === "SALE").reduce((sum, m) => sum + m.delta, 0)).toBe(-5);
    await page.goto(orderUrl); await expect(page.getByText("Заказ собран", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: ".codex-tmp/improvement-stage2/after/order-packed-mobile.png", fullPage: true });
  } finally { if (slug) await deleteTestProductFixtures([slug]); }
});
