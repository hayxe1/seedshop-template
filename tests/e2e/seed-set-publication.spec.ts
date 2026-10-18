import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./admin-utils";

type SeedSetListResponse = {
  ok: boolean;
  data?: Array<{ id: string; slug: string; isPublished: boolean }>;
};

test("черновик набора попадает на витрину только после публикации", async ({ page }) => {
  const uniqueId = Date.now();
  const slug = `publication-layer-${uniqueId}`;
  const name = `Набор публикации ${uniqueId}`;
  const publishedDescription = "Опубликованное описание набора для проверки прозрачного слоя.";
  const draftDescription = "Новое описание остаётся черновиком до повторной публикации.";
  let seedSetId: string | null = null;

  await loginAsAdmin(page);

  try {
    await page.goto("/admin/catalog/sets/new");
    await page.getByTestId("admin-seed-set-name").fill(name);
    await page.getByTestId("admin-seed-set-slug").fill(slug);
    await page.getByTestId("admin-seed-set-price").fill("299");
    await page.getByTestId("admin-seed-set-description").fill(publishedDescription);
    await page.getByTestId("admin-seed-set-product-select").selectOption({ index: 1 });
    await page.getByTestId("admin-seed-set-add-product").click();
    await page.getByLabel("Или вставьте адрес изображения").fill("/sets/salad-season.webp");

    const publishButton = page.getByTestId("admin-seed-set-publish");
    await expect(publishButton).toBeEnabled();
    await Promise.all([
      page.waitForURL((url) => {
        const match = url.pathname.match(/^\/admin\/catalog\/sets\/([^/]+)$/);
        return Boolean(match?.[1] && match[1] !== "new");
      }),
      publishButton.click(),
    ]);
    await expect(page.getByTestId("admin-seed-set-status")).toHaveText("Опубликован");
    seedSetId = new URL(page.url()).pathname.split("/").at(-1) ?? null;

    await page.goto(`/sets/${slug}`);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.getByText(publishedDescription)).toBeVisible();

    await page.goto(`/admin/catalog/sets/${seedSetId}`);
    await page.getByTestId("admin-seed-set-description").fill(draftDescription);
    await page.getByTestId("admin-seed-set-save").click();
    await expect(page.getByTestId("admin-catalog-notice")).toContainText("Черновик сохранён");

    await page.goto(`/sets/${slug}`);
    await expect(page.getByText(publishedDescription)).toBeVisible();
    await expect(page.getByText(draftDescription)).toHaveCount(0);

    await page.goto(`/admin/catalog/sets/${seedSetId}`);
    await page.getByTestId("admin-seed-set-publish").click();
    await expect(page.getByTestId("admin-seed-set-status")).toHaveText("Опубликован");

    await page.goto(`/sets/${slug}`);
    await expect(page.getByText(draftDescription)).toBeVisible();
    await page.goto("/sets");
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  } finally {
    if (!seedSetId) {
      const response = await page.request.get("/api/admin/catalog/seed-sets");
      const body = (await response.json().catch(() => null)) as SeedSetListResponse | null;
      seedSetId = body?.data?.find((seedSet) => seedSet.slug === slug)?.id ?? null;
    }

    if (seedSetId) {
      await page.request.post(`/api/admin/catalog/seed-sets/${seedSetId}/unpublish`);
      await page.request.delete(`/api/admin/catalog/seed-sets/${seedSetId}`);
    }
  }
});
