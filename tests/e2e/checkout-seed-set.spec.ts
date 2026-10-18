import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./admin-utils";
import { fillCheckoutForm, submitCheckout } from "./checkout-utils";

test("готовый набор добавляется и оформляется одной позицией", async ({ page }) => {
  await page.goto("/sets");

  await expect(page.getByTestId("add-seed-set-button").first()).toBeVisible();
  await page.getByTestId("add-seed-set-button").first().click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const parsed: unknown = JSON.parse(window.localStorage.getItem("seed-store-cart-v1") ?? "[]");
        if (!Array.isArray(parsed)) {
          return null;
        }

        return {
          length: parsed.length,
          kind: typeof parsed[0] === "object" && parsed[0] ? (parsed[0] as { kind?: string }).kind : null,
        };
      })
    )
    .toEqual({ length: 1, kind: "seedSet" });

  await page.goto("/cart");
  await expect(page.getByTestId("cart-item")).toHaveCount(1);
  await expect(page.getByTestId("cart-item-seed-set")).toBeVisible();
  await expect(page.getByTestId("cart-seed-set-contents")).toBeVisible();

  await page.goto("/checkout");
  await fillCheckoutForm(page);
  const orderNumber = await submitCheckout(page);

  await loginAsAdmin(page);
  await page.goto("/admin/orders");
  const createdOrder = page.getByTestId("admin-order-card").filter({ hasText: orderNumber });
  await expect(createdOrder).toHaveCount(1);
  await expect(createdOrder.getByTestId("admin-seed-set-order-item")).toBeVisible();
});
