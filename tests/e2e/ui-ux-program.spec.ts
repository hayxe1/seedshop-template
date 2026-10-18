import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createPublishedProductFixture as createProduct, cleanupProductFixture } from "./product-fixtures";
import type { ProductRecord, PublicOrder, AdminOrder } from "../../src/shared/api/contracts";

test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.18.2.${1 + info.line % 200}` });
});

const createPublishedProductFixture = (page: Page, options: Parameters<typeof createProduct>[1] = {}) =>
  createProduct(page, { ...options, adminLoginIp: "198.18.8.50" });

function input(p: ProductRecord) {
  return { name: p.name, slug: p.slug, description: p.description, price: p.price,
    categoryId: p.categoryId, stock: p.stock, inventoryPolicy: p.inventoryPolicy, isPublished: p.isPublished,
    packSize: p.packSize ?? "", manufacturer: p.manufacturer ?? "", mainImageUrl: p.mainImageUrl ?? "", images: p.images };
}
async function current(page: Page, product: ProductRecord): Promise<ProductRecord> {
  const body = await (await page.request.get(`/api/admin/catalog/products?q=${product.slug}`)).json();
  return body.data.find((p: ProductRecord) => p.id === product.id);
}

test("обычный ввод количества, границы и опт используют одно подтверждённое число", async ({ page }) => {
  const p = await createPublishedProductFixture(page, { stock: 2, price: 149, packSize: "20 семян" });
  try {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/product/${p.slug}`);
    const quantity = page.getByTestId("product-quantity-input");
    await expect(quantity).toBeEnabled();
    await quantity.focus(); await quantity.press("ControlOrMeta+A"); await quantity.press("Backspace");
    await expect(quantity).toHaveValue(""); await quantity.pressSequentially("20"); await quantity.press("Enter");
    await expect(quantity).toHaveValue("20"); await expect(page.getByTestId("product-preorder-notice")).toContainText("18 ед.");
    await expect(page.locator("main")).toContainText("2 980 ₽");
    for (const [typed, expected] of [["", "20"], ["0", "1"], ["1.9", "1"], ["100", "99"]]) {
      await quantity.fill(typed!); await quantity.press("Tab"); await expect(quantity).toHaveValue(expected!);
    }
    await page.getByTestId("quantity-preset-20").click(); await page.getByTestId("product-add-to-cart").click();
    await page.goto("/cart"); await expect(page.getByTestId("cart-quantity-input")).toHaveValue("20");
    await expect(page.getByTestId("cart-preorder-notice")).toBeVisible();
    await page.goto("/checkout"); await expect(page.locator("main")).toContainText("Товары (20)");
    await expect(page.locator("main")).toContainText("2 980 ₽");
  } finally { await cleanupProductFixture(page, p); }
});

test("две открытые формы: устаревшее сохранение не стирает имя и видимость, ввод остаётся", async ({ page, context }) => {
  for (const visibility of [false, true]) {
    const p = await createPublishedProductFixture(page);
    const other = await context.newPage();
    try {
      await page.goto(`/admin/catalog/products/${p.id}`); await other.goto(`/admin/catalog/products/${p.id}`);
      await page.getByTestId("admin-product-name").fill(p.name + " первая версия");
      if (visibility) await page.getByTestId("admin-product-visibility").selectOption("hidden");
      await other.getByTestId("admin-product-price").fill("321");
      if (visibility) await other.getByTestId("admin-product-name").fill(p.name + " устаревшее имя");
      await page.getByTestId("admin-drawer-save").click();
      await expect(page).toHaveURL(/saved=updated/);
      const response = other.waitForResponse(r => r.request().method() === "PATCH" && r.url().endsWith(p.id));
      await other.getByTestId("admin-drawer-save").click(); expect((await response).status()).toBe(409);
      await expect(other.getByTestId("admin-catalog-error")).toContainText("уже изменён");
      await expect(other.getByTestId("admin-product-price")).toHaveValue("321");
      await expect(other.getByRole("link", { name: /Открыть сохранённую версию/ })).toBeVisible();
      expect(await other.evaluate(id => sessionStorage.getItem(`seedshop-product-draft:${id}`), p.id)).toContain("321");
      const saved = await current(page, p); expect(saved.name).toBe(p.name + " первая версия"); expect(saved.price).toBe(p.price); expect(saved.isPublished).toBe(!visibility);
    } finally { await other.close(); await cleanupProductFixture(page, p); }
  }
});

test("сервер требует версию, сериализует одновременные записи и замечает поступление на склад", async ({ page }) => {
  const p = await createPublishedProductFixture(page, { images: [{ url: "/product-images/demo/package.png", position: 1 }] });
  const endpoint = `/api/admin/catalog/products/${p.id}`;
  try {
    expect((await page.request.patch(endpoint, { data: input(p) })).status()).toBe(428);
    const responses = await Promise.all(["Первое", "Второе"].map(name => page.request.patch(endpoint, {
      headers: { "If-Match": `"${p.updatedAt}"` }, data: { ...input(p), name },
    })));
    expect(responses.map(r => r.status()).sort()).toEqual([200, 409]);
    const saved = await current(page, p); expect(saved.images).toHaveLength(1);
    expect((await page.request.patch(endpoint + "/stock", { data: { stock: 50 } })).ok()).toBe(true);
    expect((await page.request.patch(endpoint, { headers: { "If-Match": `"${saved.updatedAt}"` }, data: input(saved) })).status()).toBe(409);
    expect((await current(page, p)).stock).toBe(50);
  } finally { await cleanupProductFixture(page, p); }
});

test("поиск согласует F1/Ф1 и точный код, не смешивает F2 и скрытые товары", async ({ page }) => {
  const key = "Маяк" + Date.now();
  const maker = "Фабрика" + Date.now();
  const p = await createPublishedProductFixture(page, { namePrefix: `${key} Ёлочка F1`, packSize: "20 семян", manufacturer: maker });
  const second = await createPublishedProductFixture(page, { namePrefix: `${key} Ёлочка F2`, packSize: "0,1 г", manufacturer: maker });
  const otherPack = await createPublishedProductFixture(page, { namePrefix: `${key} Ёлочка F1`, packSize: "0,1 г", manufacturer: maker });
  try {
    for (const query of [`${key} Елочка F1`, `${key} Ёлочка Ф1`, `  ${key}   Елочка F1  `, p.id.slice(-8).toUpperCase()]) {
      const response = await page.request.get(`/api/catalog/suggestions?q=${encodeURIComponent(query)}`);
      expect(response.ok()).toBe(true); const ids = (await response.json()).products.map((p: { id: string }) => p.id);
      expect(ids).toContain(p.id); expect(ids).not.toContain(second.id);
      if (!query.includes(p.id.slice(-8).toUpperCase())) expect(ids).toContain(otherPack.id);
      await page.goto(`/catalog?q=${encodeURIComponent(query)}`);
      await expect(page.locator(`article[data-product-slug="${p.slug}"]`)).toHaveCount(1);
      await expect(page.locator(`article[data-product-slug="${second.slug}"]`)).toHaveCount(0);
    }
    const manufacturer = await page.request.get(`/api/catalog/suggestions?q=${maker}`);
    expect((await manufacturer.json()).products.map((item: { id: string }) => item.id).sort()).toEqual([p.id, second.id, otherPack.id].sort());
    const long = await page.request.get(`/api/catalog/suggestions?q=${encodeURIComponent("Неттакоготовара ".repeat(30))}`);
    expect(long.ok()).toBe(true); expect((await long.json()).products).toEqual([]);
    expect((await page.request.patch(`/api/admin/catalog/products/${p.id}`, { headers: { "If-Match": `"${p.updatedAt}"` }, data: { ...input(p), isPublished: false } })).ok()).toBe(true);
    const hidden = await page.request.get(`/api/catalog/suggestions?q=${p.id.slice(-8)}`);
    expect((await hidden.json()).products).toEqual([]);
    await page.goto(`/catalog?q=${p.id.slice(-8)}`); await expect(page.locator(`article[data-product-slug="${p.slug}"]`)).toHaveCount(0);
  } finally { await cleanupProductFixture(page, p); await cleanupProductFixture(page, second); await cleanupProductFixture(page, otherPack); }
});

test("подсказки: отказ не выглядит пустотой, старый ответ не заменяет новый, клавиши работают", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/"); const search = page.getByRole("combobox");
  for (const status of [429, 503]) {
    await page.route("**/api/catalog/suggestions?*", route => route.fulfill({ status, contentType: "application/json", body: "{}" }));
    await search.fill(`Томат ${status}`); await expect(page.getByRole("status").filter({ hasText: "Подсказки временно недоступны" })).toBeVisible();
    await expect(search).toHaveValue(`Томат ${status}`); await search.press("Escape"); await expect(page.getByRole("listbox")).toHaveCount(0);
    await page.unroute("**/api/catalog/suggestions?*");
  }
  await page.route("**/api/catalog/suggestions?*", route => route.abort("internetdisconnected"));
  await search.fill("Проверка сети"); await expect(page.getByRole("status").filter({ hasText: "Подсказки временно недоступны" })).toBeVisible();
  await search.press("Enter"); await expect(page).toHaveURL(/\/catalog\?q=/);
  await page.unroute("**/api/catalog/suggestions?*"); await page.goto("/");
  await page.route("**/api/catalog/suggestions?*", async route => {
    const old = new URL(route.request().url()).searchParams.get("q") === "старый";
    if (old) await new Promise(resolve => setTimeout(resolve, 600));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ categories: [], products: [{ id: old ? "old" : "new", slug: "demo-tomato-1", name: old ? "Старый ответ" : "Новый ответ", price: 10, imageUrl: null, category: "ДЕМО" }] }) }).catch(() => {});
  });
  await search.fill("старый"); await page.waitForTimeout(100); await search.fill("новый");
  await expect(page.getByRole("option", { name: /Новый ответ/ })).toBeVisible(); await page.waitForTimeout(650);
  await expect(page.getByRole("option", { name: /Старый ответ/ })).toHaveCount(0);
  await search.press("ArrowDown"); await expect(search).toHaveAttribute("aria-activedescendant", /option-0/);
  await search.press("Enter"); await expect(page).toHaveURL(/\/product\/demo-tomato-1/);
});

test("цена, предзаказ и адрес товара согласованы с JSON-LD; фильтры не индексируются", async ({ page }) => {
  for (const policy of ["TRACKED", "PREORDER", "UNLIMITED"] as const) {
    const product = await createPublishedProductFixture(page, { inventoryPolicy: policy, stock: 0, price: 149 });
    try {
      await page.goto(`/product/${product.slug}?returnTo=%2Fcatalog%3Fsort%3Dnewest`);
      const data = await page.locator('main script[type="application/ld+json"]').textContent();
      const structured: Array<{ "@type": string; name: string; offers?: { price: number; availability: string } }> = JSON.parse(data!);
      const item = structured.find(item => item["@type"] === "Product")!;
      expect(item.name).toBe(product.name); expect(item.offers!.price).toBe(149);
      expect(item.offers!.availability).toBe(`https://schema.org/${policy === "UNLIMITED" ? "InStock" : "PreOrder"}`);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/product/${product.slug}$`));
    } finally { await cleanupProductFixture(page, product); }
  }
  await page.goto("/catalog?q=томат&sort=newest"); await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("явный возврат восстанавливает место, Back и прямой вход остаются обычными", async ({ page }) => {
  const p = await createPublishedProductFixture(page);
  try {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/catalog?sort=newest");
    const link = page.locator(`article[data-product-slug="${p.slug}"] h2 a`); await link.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => scrollY); await link.click(); await expect(page.getByTestId("product-quantity-input")).toBeVisible();
    await page.getByRole("link", { name: "Вернуться к результатам" }).click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(Math.max(0, y - 60));
    await expect(link).toBeInViewport(); await link.click();
    await expect(page).toHaveURL(new RegExp(`/product/${p.slug}`));
    await expect(page.getByTestId("product-quantity-input")).toBeEnabled();
    await page.goBack(); await expect(page).toHaveURL(/\/catalog\?sort=newest/); await expect(link).toBeInViewport();
    await page.goto(`/product/${p.slug}?returnTo=https://example.org`); await expect(page.getByRole("link", { name: "Вернуться к результатам" })).toHaveCount(0);
  } finally { await cleanupProductFixture(page, p); }
});

test("ошибка фото сохраняет галерею и доступ к покупке", async ({ page }) => {
  const p = await createPublishedProductFixture(page, { mainImageUrl: "/product-images/missing-ux.png", images: [{ url: "/product-images/demo/package.png", position: 1 }] });
  try {
    await page.goto(`/product/${p.slug}`); await expect(page.getByRole("img", { name: /фото пока нет/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Показать фото 2" }).click();
    await expect(page.locator("main img").first()).toBeVisible();
    await expect.poll(() => page.locator("main img").first().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.getByTestId("product-add-to-cart").click(); await page.goto("/cart"); await expect(page.getByTestId("cart-quantity-input")).toHaveValue("1");
  } finally { await cleanupProductFixture(page, p); }
});

test("мобильный набор: предпросмотр и новая публикация сохраняют состав и суммы старого заказа", async ({ page, context }) => {
  test.setTimeout(90000);
  const a = await createPublishedProductFixture(page, { stock: 100 }); const b = await createPublishedProductFixture(page, { stock: 100 });
  const name = "Набор истории " + Date.now(); const slug = "ux-history-" + Date.now();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/admin/catalog/sets/new");
  await page.getByTestId("admin-seed-set-name").fill(name); await page.getByTestId("admin-seed-set-slug").fill(slug);
  await page.getByTestId("admin-seed-set-price").fill("499"); await page.getByTestId("admin-seed-set-description").fill("Демонстрационная комплектация: два товара, проверка истории заказа.");
  for (const p of [a, b]) { await page.getByTestId("admin-seed-set-product-select").selectOption(p.id); await page.getByTestId("admin-seed-set-add-product").click(); }
  await page.getByLabel("Или вставьте адрес изображения").fill("/product-images/demo/package.png");
  const previewPromise = context.waitForEvent("page"); await page.getByRole("button", { name: "Предпросмотр", exact: true }).click(); const preview = await previewPromise;
  await expect(preview.getByRole("heading", { name, exact: true })).toBeVisible(); await preview.close();
  await page.getByTestId("admin-seed-set-publish").click(); await expect(page.getByTestId("admin-seed-set-status")).toHaveText("Опубликован");
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const order = async (quantity: number, suffix: string) => {
    const response = await page.request.post("/api/orders", { headers: { "Idempotency-Key": randomUUID(), "x-forwarded-for": "198.18.3." + suffix }, data: { customerName: "История набора", phone: "+799988803" + suffix, email: "history@example.com", shippingMethod: "SELF_PICKUP", termsAccepted: true, items: [{ kind: "seedSet", seedSetId: id, quantity }] } });
    expect(response.ok(), await response.text()).toBe(true); return (await response.json()).data as { orderUrl: string; orderNumber: string };
  };
  const first = await order(2, "11");
  const publicOrder = async (url: string): Promise<PublicOrder> => (await (await page.request.get(url.replace("/order/", "/api/orders/"))).json()).data;
  const old = await publicOrder(first.orderUrl); expect(old.items[0]).toMatchObject({ price: 499, quantity: 2 }); expect(old.items[0]!.contents).toHaveLength(2);
  await page.goto(`/admin/catalog/sets/${id}`); await page.getByTestId("admin-seed-set-price").fill("699");
  await page.getByRole("button", { name: "Убрать", exact: true }).first().click(); await page.getByTestId("admin-seed-set-save").click();
  await expect(page.getByTestId("admin-seed-set-status")).toHaveText("Есть неопубликованные изменения");
  await page.getByTestId("admin-seed-set-publish").click(); await expect(page.getByTestId("admin-seed-set-status")).toHaveText("Опубликован");
  const second = await order(1, "12"); const next = await publicOrder(second.orderUrl);
  expect(next.items[0]).toMatchObject({ price: 699, quantity: 1 }); expect(next.items[0]!.contents).toHaveLength(1);
  const unchanged = await publicOrder(first.orderUrl); expect(unchanged.items).toEqual(old.items); expect(unchanged.totalPrice).toBe(old.totalPrice);
  const admin: AdminOrder = (await (await page.request.get(`/api/admin/orders?q=${first.orderNumber}`)).json()).data[0];
  expect(admin.items[0]).toMatchObject({ priceSnapshot: 499, quantity: 2, contents: old.items[0]!.contents });
  await page.goto(first.orderUrl); await expect(page.locator("main")).toContainText(a.name); await expect(page.locator("main")).toContainText(b.name);
  await page.goto(`/sets/${slug}`); await expect(page.locator("main")).toContainText("699");
  // These order-linked fixtures remain only in this disposable database; no production cleanup is involved.
});
