import { expect, test } from "@playwright/test";
import {
  createPublishedProductFixture,
  cleanupProductFixture,
} from "./product-fixtures";

test("новая корзина показывает товар, степпер и переход к checkout", async ({ page }) => {
  await page.goto("/catalog");

  await expect(page.getByTestId("add-to-cart-button").first()).toBeVisible();
  await page.getByTestId("add-to-cart-button").first().click();

  await page.goto("/cart");

  await expect(page.getByTestId("cart-item")).toHaveCount(1);
  await expect(page.getByTestId("cart-qty")).toHaveText("1");
  await expect(page.getByText("Количество товаров", { exact: true })).toBeVisible();
  await expect(page.getByText("Сумма товаров", { exact: true })).toHaveCount(0);

  await page.getByTestId("cart-qty-increase").click();
  await expect(page.getByTestId("cart-qty")).toHaveText("2");

  await page.getByTestId("cart-checkout").click();
  await expect(page).toHaveURL(/\/checkout$/);
});

test("корзина сохраняет количество выше остатка с предупреждением Под заказ", async ({
  page,
}) => {
  const product = await createPublishedProductFixture(page, {
    namePrefix: "Bulk Quantity E2E Product",
    stock: 12,
  });

  try {
    await page.goto(`/product/${product.slug}`);

    await expect(page.getByTestId("quantity-preset-20")).toBeVisible();
    await page.getByTestId("product-quantity-input").fill("20");
    await expect(page.getByTestId("product-quantity-input")).toHaveValue("20");
    await page.getByTestId("product-add-to-cart").click();

    await page.goto("/cart");

    const item = page.getByTestId("cart-item").first();
    await expect(item).toContainText(product.name);
    await expect(item.getByTestId("cart-qty")).toHaveText("20");
    await expect(item.getByTestId("cart-qty-increase")).toBeEnabled();
    await expect(page.getByTestId("cart-preorder-notice")).toBeVisible();
  } finally {
    await cleanupProductFixture(page, product);
  }
});

test("корзину можно очистить одной кнопкой", async ({ page }) => {
  await page.goto("/catalog");

  await expect(page.getByTestId("add-to-cart-button").first()).toBeVisible();
  await page.getByTestId("add-to-cart-button").first().click();
  await page.goto("/cart");

  await expect(page.getByTestId("cart-item")).toHaveCount(1);
  await page.getByTestId("cart-clear").click();

  await expect(page.getByTestId("cart-item")).toHaveCount(0);
  await expect(page.getByText("Пока пусто", { exact: true })).toBeVisible();
});
