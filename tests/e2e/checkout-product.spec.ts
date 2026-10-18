import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { fillCheckoutForm, submitCheckout } from "./checkout-utils";
import {
  createPublishedProductFixture,
  cleanupProductFixture,
} from "./product-fixtures";

test("обычный товар проходит путь каталог -> корзина -> checkout", async ({ page }) => {
  await page.goto("/catalog");

  await expect(page.getByTestId("add-to-cart-button").first()).toBeVisible();
  await page.getByTestId("add-to-cart-button").first().click();

  await page.goto("/cart");
  await expect(page.getByTestId("cart-item")).toHaveCount(1);

  await page.goto("/checkout");
  await fillCheckoutForm(page);
  await submitCheckout(page);
  await page.getByRole("link", { name: "Открыть заказ и повторить оплату" }).click();
  await expect(page.getByText("Бесплатный самовывоз")).toBeVisible();
});

test("checkout требует email покупателя", async ({ page }) => {
  await page.goto("/catalog");
  await page.getByTestId("add-to-cart-button").first().click();

  await page.goto("/checkout");
  await fillCheckoutForm(page);

  const email = page.getByTestId("checkout-email");
  await email.fill("");
  await expect(email).toHaveAttribute("required", "");
  await page.getByTestId("checkout-submit").click();

  expect(await email.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await expect(page).toHaveURL(/\/checkout$/);
});

test("mobile checkout validation keeps the invalid field below the sticky header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog");
  await page.getByTestId("add-to-cart-button").first().click();
  await page.goto("/checkout");
  await page.getByTestId("checkout-submit").click();
  const name = page.getByTestId("checkout-name");
  await expect(name).toBeFocused();
  await expect.poll(async () => name.evaluate((input) => {
    const header = document.querySelector("header");
    return input.getBoundingClientRect().top - (header?.getBoundingClientRect().bottom ?? 0);
  })).toBeGreaterThanOrEqual(8);
});

test("доставка по Воронежу сохраняется отдельно от оплаты товаров", async ({ page }) => {
  await page.goto("/catalog");
  await page.getByTestId("add-to-cart-button").first().click();

  await page.goto("/checkout");
  await fillCheckoutForm(page, {
    phone: "+7 (999) 123-45-68",
    shippingMethod: "LOCAL_COURIER",
    address: "Воронеж, улица Кольцовская, дом 10",
  });
  await submitCheckout(page);

  await page.getByRole("link", { name: "Открыть заказ и повторить оплату" }).click();
  await expect(page.getByText("Доставка по Воронежу")).toBeVisible();
  await expect(page.getByText("Воронеж, улица Кольцовская, дом 10")).toBeVisible();
});

test("checkout сохраняет количество сверх остатка под заказ до согласования сроков", async ({ page }) => {
  const product = await createPublishedProductFixture(page, {
    namePrefix: "Bulk Quantity E2E Product",
    stock: 12,
  });

  try {
    const response = await page.request.post("/api/orders", {
      headers: {
        "Idempotency-Key": randomUUID(),
        "x-forwarded-for": "198.51.100.121",
      },
      data: {
        customerName: "Stock Guard Buyer",
        phone: "+7 (999) 223-45-67",
        email: "stock-guard@example.com",
        shippingMethod: "SELF_PICKUP",
        termsAccepted: true,
        items: [{ kind: "product", productId: product.id, quantity: 20 }],
      },
    });
    const result = await response.json();

    expect(response.ok(), JSON.stringify(result)).toBeTruthy();
    expect(result.data).toMatchObject({ preorderPending: true, paymentStatus: "NOT_STARTED", paymentConfirmationUrl: null });
    const order = await page.request.get(result.data.orderUrl.replace("/order/", "/api/orders/"));
    expect((await order.json()).data).toMatchObject({
      canRetryPayment: false,
      items: [{ quantity: 20, isPreorder: true }],
    });
  } finally {
    await cleanupProductFixture(page, product);
  }
});
