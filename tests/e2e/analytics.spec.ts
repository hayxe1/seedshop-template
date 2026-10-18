import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  cleanupProductFixture,
  createPublishedProductFixture,
} from "./product-fixtures";

const CONSENT_KEY = "seedshop-template-analytics-consent-v1";
const analyticsEnabled = process.env.E2E_ENABLE_ANALYTICS === "1";

type EcommerceEntry = {
  ecommerce: {
    detail?: { products: Array<{ quantity?: number }> };
    add?: { products: Array<{ quantity?: number }> };
    remove?: { products: Array<{ quantity?: number }> };
    purchase?: {
      actionField: { id: string; revenue: number };
      products: Array<{
        id: string;
        name: string;
        category?: string;
        price: number;
        quantity?: number;
      }>;
    };
  };
};

type AnalyticsWindow = Window &
  typeof globalThis & {
    ym?: { a?: unknown[][] };
    dataLayer?: EcommerceEntry[];
  };

async function mockMetricaScript(page: Page) {
  await page.route("https://mc.yandex.ru/metrika/tag.js**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" })
  );
}

async function acceptAnalyticsBeforeNavigation(page: Page) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: CONSENT_KEY, value: "accepted" }
  );
}

test.describe("Яндекс Метрика", () => {
  test.skip(!analyticsEnabled, "Run with E2E_ENABLE_ANALYTICS=1");

  test("не загружает счетчик до согласия или после отказа", async ({ page }) => {
    await mockMetricaScript(page);
    await page.goto("/catalog");

    await expect(page.getByLabel("Настройка аналитики")).toBeVisible();
    await expect(page.locator('script[data-seedshop-template-metrica="112256127"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as AnalyticsWindow).dataLayer)).toBeUndefined();

    await page.getByRole("button", { name: "Только необходимые" }).click();
    await expect(page.getByLabel("Настройка аналитики")).toHaveCount(0);
    await expect(page.locator('script[data-seedshop-template-metrica="112256127"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as AnalyticsWindow).dataLayer)).toBeUndefined();
  });

  test("инициализирует счетчик, считает переходы и изменения корзины", async ({ page }) => {
    await mockMetricaScript(page);
    await acceptAnalyticsBeforeNavigation(page);
    await page.goto("/catalog");

    await expect(page.locator('script[data-seedshop-template-metrica="112256127"]')).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as AnalyticsWindow).ym?.a?.map((args) => args.slice(0, 2)) ?? []
        )
      )
      .toContainEqual([112256127, "init"]);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as AnalyticsWindow).ym?.a?.filter((args) => args[1] === "hit").length ?? 0
        )
      )
      .toBe(1);

    const productLink = page.locator('a[href^="/product/"]').first();
    await productLink.click();
    await expect(page).toHaveURL(/\/product\//);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as AnalyticsWindow).dataLayer?.filter((entry) => entry.ecommerce.detail)
            .length ?? 0
        )
      )
      .toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as AnalyticsWindow).ym?.a?.filter((args) => args[1] === "hit").length ?? 0
        )
      )
      .toBe(2);

    await page.getByTestId("product-add-to-cart").click();
    const addEvent = await page.evaluate(() =>
      (window as AnalyticsWindow).dataLayer?.findLast((entry) => entry.ecommerce.add)
    );
    expect(addEvent?.ecommerce.add?.products[0]?.quantity).toBe(1);

    await page.goto("/cart");
    await page.getByTestId("cart-qty-increase").click();
    await page.getByTestId("cart-qty-decrease").click();
    const cartEvents = await page.evaluate(() =>
      (window as AnalyticsWindow).dataLayer
        ?.filter((entry) => entry.ecommerce.add || entry.ecommerce.remove)
        .map((entry) => ({
          add: entry.ecommerce.add?.products[0]?.quantity,
          remove: entry.ecommerce.remove?.products[0]?.quantity,
        })) ?? []
    );
    expect(cartEvents).toEqual([{ add: 1, remove: undefined }, { add: undefined, remove: 1 }]);
  });

  test("отправляет покупку один раз только после успешной оплаты", async ({ page }) => {
    const product = await createPublishedProductFixture(page, {
      namePrefix: "Analytics E2E Product",
      price: 173,
      stock: 5,
    });

    try {
      const checkoutResponse = await page.request.post("/api/orders", {
        headers: {
          "Idempotency-Key": randomUUID(),
          "x-forwarded-for": "198.51.100.141",
        },
        data: {
          customerName: "Analytics Test Buyer",
          phone: "+7 (999) 444-55-66",
          email: "analytics-test@example.com",
          shippingMethod: "SELF_PICKUP",
          termsAccepted: true,
          items: [{ kind: "product", productId: product.id, quantity: 2 }],
        },
      });
      const checkout = await checkoutResponse.json();
      expect(checkoutResponse.ok(), JSON.stringify(checkout)).toBeTruthy();

      await mockMetricaScript(page);
      await acceptAnalyticsBeforeNavigation(page);
      await page.goto(checkout.data.orderUrl);
      await expect(page.getByRole("heading", { name: "Ожидаем оплату" })).toBeVisible();
      expect(
        await page.evaluate(() =>
          (window as AnalyticsWindow).dataLayer?.some((entry) => entry.ecommerce.purchase)
        )
      ).not.toBe(true);

      const loginResponse = await page.request.post("/api/admin/login", {
        data: {
          email: "admin@seed-store.local",
          password: "change-me",
        },
      });
      expect(loginResponse.ok()).toBeTruthy();
      const ordersResponse = await page.request.get(
        `/api/admin/orders?q=${encodeURIComponent(checkout.data.orderNumber)}`
      );
      const orders = await ordersResponse.json();
      const order = orders.data[0] as { yookassaPaymentId: string };

      const webhookResponse = await page.request.post("/api/yookassa/webhook", {
        headers: { "x-forwarded-for": "198.51.100.142" },
        data: {
          type: "notification",
          event: "payment.succeeded",
          object: { id: order.yookassaPaymentId },
        },
      });
      expect(webhookResponse.ok(), await webhookResponse.text()).toBeTruthy();

      await expect(page.getByRole("heading", { name: "Заказ оплачен" })).toBeVisible();

      await expect
        .poll(() =>
          page.evaluate(() =>
            (window as AnalyticsWindow).dataLayer?.find((entry) => entry.ecommerce.purchase)
              ?.ecommerce.purchase
          )
        )
        .not.toBeUndefined();

      const purchasePayload = await page.evaluate(() =>
        (window as AnalyticsWindow).dataLayer?.find((entry) => entry.ecommerce.purchase)
          ?.ecommerce.purchase
      );
      expect(purchasePayload?.actionField).toEqual({
        id: checkout.data.orderNumber,
        revenue: 346,
      });
      expect(purchasePayload?.products).toEqual([
        expect.objectContaining({
          id: product.id,
          name: product.name,
          category: product.category.name,
          price: 173,
          quantity: 2,
        }),
      ]);
      expect(JSON.stringify(purchasePayload)).not.toContain("analytics-test@example.com");
      expect(JSON.stringify(purchasePayload)).not.toContain("999");

      await page.reload();
      await expect
        .poll(() =>
          page.evaluate(() =>
          (window as AnalyticsWindow).dataLayer?.filter((entry) => entry.ecommerce.purchase)
            .length ?? 0
          )
        )
        .toBe(0);
    } finally {
      await cleanupProductFixture(page, product);
    }
  });
});
