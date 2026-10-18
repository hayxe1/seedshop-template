import { expect, test } from "@playwright/test";

test("служебные e2e-товары скрыты из публичной витрины и sitemap", async ({ page }) => {
  await page.goto("/catalog?q=Bulk%20Quantity%20Test%20Product");
  await expect(page.getByRole("link", { name: "Bulk Quantity Test Product", exact: true })).toHaveCount(0);

  await page.goto("/catalog?q=Disposable%20Delete%20Test%20Product");
  await expect(page.getByRole("link", { name: "Disposable Delete Test Product", exact: true })).toHaveCount(0);

  await page.goto("/catalog?q=Protected%20Delete%20Test%20Product");
  await expect(page.getByRole("link", { name: "Protected Delete Test Product", exact: true })).toHaveCount(0);

  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  const sitemapText = await sitemap.text();
  expect(sitemapText).not.toContain("bulk-quantity-test-product");
  expect(sitemapText).not.toContain("disposable-delete-test-product");
  expect(sitemapText).not.toContain("protected-delete-test-product");

  await page.goto("/product/bulk-quantity-test-product");
  await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();

  await page.goto("/product/protected-delete-test-product");
  await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
});

test("страницы для проверки ЮKassa открываются и содержат ключевые условия", async ({
  page,
}) => {
  await page.goto("/delivery");
  await expect(page.getByRole("heading", { name: "Доставка" })).toBeVisible();
  await expect(page.getByText("Бесплатный самовывоз")).toBeVisible();
  await expect(page.getByText("Доставка по Воронежу", { exact: true })).toBeVisible();
  await expect(page.getByText(/Доставку в другие города России добавим позже/)).toBeVisible();

  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: /Контакты/ })).toBeVisible();
  await expect(page.getByText("[Телефон продавца]", { exact: true })).toBeVisible();
  await expect(page.getByText("shop@example.com")).toBeVisible();
  await expect(page.getByText("hello@seedshop-template.example")).toHaveCount(0);
  await expect(page.getByText("Почтовый адрес", { exact: true })).toBeVisible();

  await page.goto("/offer");
  await expect(page.getByRole("heading", { name: "Публичная оферта" })).toBeVisible();
  await expect(page.getByText(/Шаблон документа/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Возврат и отмена" })).toBeVisible();

  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Политика обработки персональных данных" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Отзыв согласия" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Настройки аналитики" })).toBeVisible();
});
