import { expect, test } from "@playwright/test";
import path from "node:path";
import { loginAsAdmin } from "./admin-utils";
import { deleteUnlinkedTestProducts } from "./test-database";
import {
  createPublishedProductFixture,
  cleanupProductFixture,
} from "./product-fixtures";

const createdProductSlugs = new Set<string>();

test.afterEach(async () => {
  try {
    await deleteUnlinkedTestProducts(createdProductSlugs);
  } finally {
    createdProductSlugs.clear();
  }
});

test("администратор может удалить товар без связей", async ({ page }) => {
  const uniqueId = Date.now();
  const productName = `Delete Smoke ${uniqueId}`;
  const expectedSlug = `delete-smoke-${uniqueId}`;
  createdProductSlugs.add(expectedSlug);

  await loginAsAdmin(page);
  await page.goto("/admin/catalog");

  await page.getByTestId("admin-create-product").click();
  await page.getByTestId("admin-product-name").fill(productName);
  await page.getByTestId("admin-product-price").fill("149");
  await page
    .getByTestId("admin-product-description")
    .fill("Временный товар для e2e-проверки успешного удаления.");
  await page.getByTestId("admin-drawer-save").click();

  const card = page.getByTestId(`admin-product-card-${expectedSlug}`);
  await expect(card).toBeVisible();

  await card.getByTestId("admin-product-edit").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("admin-drawer-delete").click();

  await expect(page.getByTestId(`admin-product-card-${expectedSlug}`)).toHaveCount(0);
});

test("связанный скрытый товар нельзя удалить", async ({ page }) => {
  const product = await createPublishedProductFixture(page, {
    namePrefix: "Linked Hidden E2E Product",
  });
  const seedSetSlug = `linked-product-set-${Date.now()}`;
  let seedSetId: string | null = null;

  try {
    const seedSetResponse = await page.request.post("/api/admin/catalog/seed-sets", {
      data: {
        name: `Linked product set ${Date.now()}`,
        slug: seedSetSlug,
        shortDescription: "Temporary linked set.",
        description: "Temporary set that verifies linked products cannot be deleted.",
        imageUrl: "",
        price: 199,
        seoTitle: "",
        seoDescription: "",
        items: [{ productId: product.id, position: 1 }],
      },
    });
    expect(seedSetResponse.ok()).toBeTruthy();
    const seedSetBody = (await seedSetResponse.json()) as {
      ok: boolean;
      data?: { id: string };
    };
    seedSetId = seedSetBody.data?.id ?? null;
    expect(seedSetId).toBeTruthy();

    await loginAsAdmin(page);
    await page.goto(`/admin/catalog/products/${product.id}`);
    await page.getByTestId("admin-product-visibility").selectOption("hidden");
    await page.getByTestId("admin-drawer-save").click();
    await expect(page).toHaveURL(/\/admin\/catalog\?tab=products/);

    await page.goto(`/admin/catalog/products/${product.id}`);
    await expect(page.getByTestId("admin-product-visibility")).toHaveValue("hidden");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("admin-drawer-delete").click();

    await expect(page.getByTestId("admin-catalog-error")).toContainText("нельзя удалить");
    await expect(page.getByTestId("admin-product-unpublish-fallback")).toBeDisabled();
    await expect(page.getByTestId("admin-product-visibility")).toHaveValue("hidden");
  } finally {
    if (seedSetId) {
      await page.request.delete(`/api/admin/catalog/seed-sets/${seedSetId}`);
    }
    await cleanupProductFixture(page, product);
  }
});

test("администратор может добавить картинку из библиотеки", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const uniqueId = Date.now();
  const productName = `Asset Smoke ${uniqueId}`;
  const expectedSlug = `asset-smoke-${uniqueId}`;
  createdProductSlugs.add(expectedSlug);

  await loginAsAdmin(page);
  await page.goto("/admin/catalog");

  await page.getByTestId("admin-create-product").click();
  await page.getByTestId("admin-product-name").fill(productName);
  await page.getByTestId("admin-product-price").fill("199");
  await page.getByTestId("admin-product-description").fill("Товар для проверки выбора изображения.");
  const primaryFields = await page.getByTestId("admin-product-price").evaluate((price) => ({
    priceTop: price.getBoundingClientRect().top,
    mediaTop: Array.from(document.querySelectorAll("h2")).find((heading) => heading.textContent === "Медиафайлы")?.getBoundingClientRect().top,
  }));
  expect(primaryFields.mediaTop).toBeDefined();
  expect(primaryFields.priceTop).toBeLessThan(primaryFields.mediaTop!);
  await page.getByText("Выбрать из библиотеки изображений", { exact: true }).click();
  await page.getByTestId("admin-asset-select-main").first().click();
  await page.getByTestId("admin-drawer-save").click();

  const card = page.getByTestId(`admin-product-card-${expectedSlug}`);
  await expect(card).toBeVisible();
  await expect(card.locator("img")).toBeVisible();

  await card.getByTestId("admin-product-edit").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("admin-drawer-delete").click();
  await expect(page.getByTestId(`admin-product-card-${expectedSlug}`)).toHaveCount(0);
});

test("локальная загрузка картинки работает как предпросмотр и не сохраняет blob в товар", async ({ page }) => {
  const uniqueId = Date.now();
  const productName = `Upload Preview ${uniqueId}`;
  const expectedSlug = `upload-preview-${uniqueId}`;
  createdProductSlugs.add(expectedSlug);
  const fixtureImage = path.resolve(
    process.cwd(),
    "public",
    "category-icons",
    "ogurtsy-reference.png"
  );

  await loginAsAdmin(page);
  await page.goto("/admin/catalog");

  await page.getByTestId("admin-create-product").click();
  await page.getByTestId("admin-product-name").fill(productName);
  await page.getByTestId("admin-product-price").fill("179");
  await page.getByTestId("admin-product-description").fill("Товар для проверки локального предпросмотра.");
  await page.getByTestId("admin-product-file-input").setInputFiles(fixtureImage);
  await expect(page.getByTestId("admin-product-local-upload")).toContainText(
    "ogurtsy-reference.png"
  );
  await expect(page.getByTestId("admin-product-local-upload")).toContainText("Загружено");
  await page.getByTestId("admin-drawer-save").click();

  const card = page.getByTestId(`admin-product-card-${expectedSlug}`);
  await expect(card).toBeVisible();
  const cardImage = card.locator("img");
  await expect(cardImage).toBeVisible();
  await expect(cardImage).not.toHaveAttribute("src", /^blob:/);

  await card.getByTestId("admin-product-edit").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("admin-drawer-delete").click();
  await expect(page.getByTestId(`admin-product-card-${expectedSlug}`)).toHaveCount(0);
});
