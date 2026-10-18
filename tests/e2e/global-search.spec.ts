import { expect, test } from "@playwright/test";
import {
  cleanupProductFixture,
  createPublishedProductFixture,
} from "./product-fixtures";

const inflectionCases = [
  { query: "огурцы", expectedProduct: /Огурец/i },
  { query: "помидоры", expectedProduct: /Томат/i },
  { query: "перцы", expectedProduct: /Перец/i },
  { query: "свеклы", expectedProduct: /Свекла/i },
  { query: "кукурузы", expectedProduct: /Кукуруза/i },
] as const;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("глобальный поиск в хедере ведет в каталог с query", async ({ page }) => {
  await page.goto("/");

  const search = page.getByRole("search", { name: "Поиск по каталогу" });
  await search.getByRole("combobox", { name: "Поиск по каталогу" }).fill("томат");
  await search.getByRole("button", { name: "Найти" }).click();

  await expect
    .poll(() => {
      const url = new URL(page.url());

      return {
        pathname: url.pathname,
        query: url.searchParams.get("q"),
      };
    })
    .toEqual({
      pathname: "/catalog",
      query: "томат",
    });
  await expect(
    page.getByRole("searchbox", { name: "Что хотите вырастить" })
  ).toHaveValue("томат");
  await expect(page.getByRole("heading", { name: /\d+ товар/ })).toBeVisible();
});

for (const { query, expectedProduct } of inflectionCases) {
  test(`глобальный поиск находит товар по запросу «${query}»`, async ({ page }) => {
    await page.goto("/");

    const search = page.getByRole("search", { name: "Поиск по каталогу" });
    await search.getByRole("combobox", { name: "Поиск по каталогу" }).fill(query);
    await search.getByRole("button", { name: "Найти" }).click();

    await expect
      .poll(() => {
        const url = new URL(page.url());
        return { pathname: url.pathname, query: url.searchParams.get("q") };
      })
      .toEqual({ pathname: "/catalog", query });
    await expect(page.getByRole("heading", { name: /\d+ товар/ })).toBeVisible();
    await expect(page.getByRole("link", { name: expectedProduct }).first()).toBeVisible();
  });
}

test("глобальный поиск не различает е и ё", async ({ page }) => {
  const product = await createPublishedProductFixture(page, {
    namePrefix: "Томат Ёжик E2E Product",
  });

  try {
    await page.goto("/");
    const search = page.getByRole("search", { name: "Поиск по каталогу" });
    await search.getByRole("combobox", { name: "Поиск по каталогу" }).fill("ежик");
    await search.getByRole("button", { name: "Найти" }).click();

    await expect(page).toHaveURL(/\/catalog\?q=%D0%B5%D0%B6%D0%B8%D0%BA/);
    await expect(page.getByText(product.name).first()).toBeVisible();
  } finally {
    await cleanupProductFixture(page, product);
  }
});
