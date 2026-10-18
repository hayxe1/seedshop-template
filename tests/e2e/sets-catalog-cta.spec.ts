import { expect, test } from "@playwright/test";

test("страница наборов открывает короткий подбор", async ({ page }) => {
  await page.goto("/sets");

  await expect(page.getByTestId("manual-set-builder")).toHaveCount(0);
  await page.getByTestId("sets-catalog-cta").click();
  await expect(page).toHaveURL(/\/selection$/);
  await expect(page.getByRole("heading", { name: /подбер/i })).toBeVisible();
});
