import { expect, test, type APIResponse } from "@playwright/test";
import { loginAsAdmin } from "./admin-utils";
import type { CategoryRecord, ProductRecord } from "../../src/shared/api/contracts";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

async function parseApiResponse<T>(response: APIResponse, label: string) {
  const raw = await response.text();
  const parsed = JSON.parse(raw) as ApiResponse<T>;

  expect(response.ok(), `${label} failed with ${response.status()}: ${raw}`).toBeTruthy();
  expect(parsed.ok, `${label} returned an error: ${raw}`).toBe(true);

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return parsed.data;
}

test("главная показывает новый hero, быстрые категории и превью каталога", async ({ page }) => {
  await page.goto("/");

  const primaryHeading = page.getByRole("heading", { level: 1 });
  await expect(primaryHeading).toHaveCount(1);
  await expect(primaryHeading).toContainText("Купить семена");

  const catalogCta = page.getByRole("link", { name: "Выбрать семена" });
  await expect(catalogCta).toHaveAttribute("href", "/catalog");

  await expect(page.getByRole("heading", { name: "Популярно сегодня" })).toBeVisible();
  await expect(page.getByTestId("home-popular-card")).toHaveCount(8);

  const tomatoCategory = page.getByRole("link", { name: /Томаты/ });
  await expect(tomatoCategory).toHaveAttribute("href", "/catalog/tomaty");

  await expect(page.getByRole("heading", { name: "Каталог семян" })).toBeVisible();
  await expect(page.getByTestId("home-catalog-preview-card")).toHaveCount(16);
  await expect(page.getByRole("link", { name: "Смотреть весь каталог" })).toHaveAttribute(
    "href",
    "/catalog"
  );
});

test("админский флаг добавляет товар в блок Популярно сегодня", async ({ page }) => {
  const uniqueId = Date.now();
  const productName = `Popular Home Smoke ${uniqueId}`;
  const productSlug = `popular-home-smoke-${uniqueId}`;
  let createdProduct: ProductRecord | null = null;

  await loginAsAdmin(page);

  try {
    const categories = await parseApiResponse<CategoryRecord[]>(
      await page.request.get("/api/admin/catalog/categories"),
      "Load admin categories"
    );
    const category = categories.find((item) => item.slug === "semena") ?? categories[0];
    if (!category) {
      throw new Error("Expected at least one category");
    }

    const existingProducts = await parseApiResponse<ProductRecord[]>(
      await page.request.get("/api/admin/catalog/products?pageSize=1"),
      "Load sample product"
    );
    const sampleImageUrl = existingProducts[0]?.mainImageUrl ?? "";

    createdProduct = await parseApiResponse<ProductRecord>(
      await page.request.post("/api/admin/catalog/products", {
        data: {
          name: productName,
          slug: productSlug,
          description: "Временный товар для проверки блока Популярно сегодня.",
          shortDescription: "Временный товар для проверки главной.",
          price: 149,
          mainImageUrl: sampleImageUrl,
          plantingTips: "",
          categoryId: category.id,
          isPublished: true,
          isPopularToday: true,
          seoTitle: "",
          seoDescription: "",
          stock: 10,
          images: sampleImageUrl ? [{ url: sampleImageUrl, position: 1 }] : [],
        },
      }),
      "Create popular product"
    );

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Популярно сегодня" })).toBeVisible();
    await expect(page.getByLabel("Популярно сегодня").getByText(productName)).toBeVisible();
  } finally {
    if (createdProduct) {
      await page.request.delete(`/api/admin/catalog/products/${createdProduct.id}`);
    }
  }
});
