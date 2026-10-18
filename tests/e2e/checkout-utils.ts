import { expect, type Page } from "@playwright/test";

type CheckoutFormOverrides = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  comment?: string;
  shippingMethod?: "SELF_PICKUP" | "LOCAL_COURIER";
};

export async function fillCheckoutForm(page: Page, overrides: CheckoutFormOverrides = {}) {
  await page.getByTestId("checkout-name").fill(overrides.name ?? "Тестовый покупатель");
  await page.getByTestId("checkout-phone").fill(overrides.phone ?? "+7 (999) 123-45-67");
  await page.getByTestId("checkout-email").fill(overrides.email ?? "buyer@example.com");
  if (overrides.shippingMethod === "LOCAL_COURIER") {
    await page.getByTestId("checkout-shipping-local-courier").check();
    await page
      .getByTestId("checkout-address")
      .fill(overrides.address ?? "Воронеж, улица Проверки, дом 7");
  }
  await page.getByTestId("checkout-comment").fill(overrides.comment ?? "Оставить у двери");
  await page.getByTestId("checkout-terms").check();
}

export async function submitCheckout(page: Page) {
  await page.getByTestId("checkout-submit").click();
  await expect(page.getByRole("heading", { name: "Переходим к оплате" })).toBeVisible();
  const orderNumberLabel = page.getByText(/Номер заказа:/);
  await expect(orderNumberLabel).toBeVisible();
  const orderNumber = (await orderNumberLabel.textContent())?.match(/\bORD-\d+\b/)?.[0];

  expect(orderNumber, "Checkout confirmation must expose the created order number.").toBeTruthy();
  if (!orderNumber) {
    throw new Error("Checkout confirmation did not contain an order number.");
  }

  return orderNumber;
}
