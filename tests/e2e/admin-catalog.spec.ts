import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./admin-utils";
import {
  createPublishedProductFixture,
  cleanupProductFixture,
} from "./product-fixtures";

test("админ видит dashboard и новый catalog", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/admin");
  await expect(page.getByTestId("admin-dashboard-metrics")).toBeVisible();

  await page.goto("/admin/products");
  await expect(page).toHaveURL(/\/admin\/catalog\?tab=products/);
  await expect(page.getByTestId("admin-create-product")).toBeVisible();
});

test("админ может создать и удалить категорию", async ({ page }) => {
  const uniqueSlug = `e2e-category-${Date.now()}`;

  await loginAsAdmin(page);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/catalog/categories") && response.status() === 200
    ),
    page.goto("/admin/catalog?tab=categories"),
  ]);
  await page.getByTestId("admin-create-category").click();
  await page.getByTestId("admin-category-name").fill(`E2E Category ${uniqueSlug}`);
  await page.getByTestId("admin-category-slug").fill(uniqueSlug);
  await page.getByTestId("admin-drawer-save").click();

  const card = page.getByTestId(`admin-category-card-${uniqueSlug}`);
  await expect(card).toBeVisible();

  await card.getByTestId("admin-category-edit").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("admin-drawer-delete").click();
  await expect(page.getByTestId(`admin-category-card-${uniqueSlug}`)).toHaveCount(0);
});

test("админ может создать и удалить набор", async ({ page }) => {
  const uniqueSlug = `e2e-set-${Date.now()}`;
  let seedSetId: string | null = null;

  await loginAsAdmin(page);

  try {
    await page.goto("/admin/catalog?tab=sets");
    await page.getByTestId("admin-create-seed-set").click();
    await page.getByTestId("admin-seed-set-name").fill(`E2E Set ${uniqueSlug}`);
    await page.getByTestId("admin-seed-set-slug").fill(uniqueSlug);
    await page.getByTestId("admin-seed-set-price").fill("299");
    await page.getByTestId("admin-seed-set-description").fill("Набор для e2e-проверки.");
    await page.getByTestId("admin-seed-set-product-select").selectOption({ index: 1 });
    await page.getByTestId("admin-seed-set-add-product").click();
    await page.getByTestId("admin-seed-set-save").click();
    await expect(page.getByTestId("admin-catalog-notice")).toContainText("Черновик сохранён");
    await expect(page).toHaveURL(/\/admin\/catalog\/sets\//);
    seedSetId = new URL(page.url()).pathname.split("/").at(-1) ?? null;

    await page.goto("/admin/catalog?tab=sets");
    const card = page.getByTestId(`admin-seed-set-card-${uniqueSlug}`);
    await expect(card).toBeVisible();

    await card.getByTestId("admin-seed-set-edit").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("admin-seed-set-delete").click();
    await expect(page).toHaveURL(/\/admin\/catalog\?tab=sets/);
    await expect(page.getByTestId(`admin-seed-set-card-${uniqueSlug}`)).toHaveCount(0);
    seedSetId = null;
  } finally {
    if (seedSetId) {
      await page.request.delete(`/api/admin/catalog/seed-sets/${seedSetId}`);
    }
  }
});

test("админ быстро корректирует остаток, а движение видно на dashboard", async ({ page }) => {
  const product = await createPublishedProductFixture(page, {
    namePrefix: "Quick Stock E2E Product",
    stock: 4,
  });

  try {
    await loginAsAdmin(page);
    await page.goto(`/admin/catalog?q=${encodeURIComponent(product.name)}`);

    const card = page.getByTestId(`admin-product-card-${product.slug}`);
    await expect(card).toBeVisible();
    const input = card.getByRole("spinbutton", { name: `Остаток ${product.name}` });
    await input.fill("9");
    await card.getByRole("button", { name: "Сохранить" }).click();
    await expect(card.getByRole("status")).toHaveText("+5");
    await expect(input).toHaveValue("9");

    await page.goto("/admin");
    await expect(page.getByText(product.name)).toBeVisible();
    await expect(page.getByText("Ручная корректировка").first()).toBeVisible();
  } finally {
    await cleanupProductFixture(page, product);
  }
});

test("поиск каталога синхронизирует input с URL и browser history", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/catalog?q=${encodeURIComponent("Редис")}`);

  const search = page.getByRole("searchbox", { name: "Поиск по каталогу" });
  await expect(search).toHaveValue("Редис");

  await search.fill("Томат");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("Томат");
  await expect(page.getByText(/по запросу «Томат»/i)).toBeVisible();

  await page.goto(`/admin/catalog?q=${encodeURIComponent("Огурец")}`);
  await expect(search).toHaveValue("Огурец");

  await page.goBack();
  await expect(page).toHaveURL(/q=%D0%A2%D0%BE%D0%BC%D0%B0%D1%82/);
  await expect(search).toHaveValue("Томат");
});
