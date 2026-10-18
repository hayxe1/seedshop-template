import { expect, test } from "@playwright/test";

const primaryCategories = ["Томаты", "Огурцы", "Перцы", "Свекла", "Кукуруза", "Морковь"] as const;

const categoryPages = [
  { slug: "tomaty", heading: "Томаты", product: /Томат/i },
  { slug: "ogurtsy", heading: "Огурцы", product: /Огурец/i },
  { slug: "svekla", heading: "Свекла", product: /Свекла/i },
  { slug: "kukuruza", heading: "Кукуруза", product: /Кукуруза/i },
];

test("каталог показывает разделенные овощные категории", async ({ page }) => {
  await page.goto("/catalog");

  for (const categoryName of primaryCategories) {
    await expect(page.getByRole("checkbox", { name: categoryName, exact: true })).toBeVisible();
  }

  await page
    .getByRole("checkbox", { name: primaryCategories[0], exact: true })
    .locator("..")
    .click();
  await page
    .getByRole("checkbox", { name: primaryCategories[1], exact: true })
    .locator("..")
    .click();
  await page.getByRole("button", { name: "Применить", exact: true }).click();

  await expect(page).toHaveURL(/category=tomaty/);
  await expect(page).toHaveURL(/category=ogurtsy/);
  await expect(page.getByRole("checkbox", { name: primaryCategories[0], exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: primaryCategories[1], exact: true })).toBeChecked();
});

test("страницы овощных категорий показывают соответствующие товары", async ({ page }) => {
  for (const category of categoryPages) {
    await page.goto(`/catalog/${category.slug}`);

    await expect(page.getByRole("heading", { name: category.heading, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: category.product }).first()).toBeVisible();
  }
});

test("старая страница овощей перенаправляет в общий каталог", async ({ page }) => {
  await page.goto("/catalog/ovoshchi");

  await expect(page).toHaveURL(/\/catalog$/);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveCount(1);
  await expect(heading).toContainText("Купить семена");
  await expect(page.getByRole("searchbox", { name: "Что хотите вырастить" })).toBeVisible();
});
