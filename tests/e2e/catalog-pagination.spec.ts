import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./admin-utils";
import { createCatalogPaginationFixtures, deleteUnlinkedTestProducts } from "./test-database";

test("admin catalog exposes products beyond 100 and preserves pagination on reload", async ({ page }) => {
  await loginAsAdmin(page);
  const categories = (await (await page.request.get("/api/admin/catalog/categories")).json()).data;
  const prefix = `e2e-pagination-${Date.now()}`;
  const slugs = await createCatalogPaginationFixtures(categories[0].id, prefix);
  try {
    const result = await page.request.get(`/api/admin/catalog/products?q=${prefix}&page=9&pageSize=12`);
    const body = await result.json();
    expect(body.meta).toMatchObject({ total: 105, totalPages: 9 });
    expect(body.data).toHaveLength(9);
    await page.goto(`/admin/catalog?tab=products&q=${prefix}&page=9`);
    await expect(page.getByTestId(/^admin-product-card-/)).toHaveCount(9);
    await expect(page.getByRole("button", { name: "9", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "8", exact: true }).click();
    await expect(page).toHaveURL(/page=8/);
    await expect(page.getByTestId(/^admin-product-card-/)).toHaveCount(12);
    await page.reload();
    await expect(page.getByRole("button", { name: "8", exact: true })).toHaveAttribute("aria-current", "page");
    await page.goto(`/admin/catalog?tab=products&q=${prefix}&published=published&stock=tracked&image=missing`);
    await page.getByRole("button", { name: /Фильтры/ }).click();
    await page.getByRole("button", { name: "Сбросить", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.has("published") || new URL(page.url()).searchParams.has("stock") || new URL(page.url()).searchParams.has("image")).toBe(false);
    await page.getByRole("button", { name: "Наборы", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Наборы", exact: true })).toBeVisible();
  } finally {
    await deleteUnlinkedTestProducts(slugs);
  }
});
