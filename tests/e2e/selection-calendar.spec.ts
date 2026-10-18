import { expect, test } from "@playwright/test";
import {
  createPublishedProductFixture,
  cleanupProductFixture,
} from "./product-fixtures";

test("подбор объясняет результат, а календарь различает этапы сезона", async ({ page }) => {
  const place = `Зимний сад E2E ${Date.now()}`;
  const product = await createPublishedProductFixture(page, {
    namePrefix: "Selector Calendar E2E Product",
    stock: 8,
    isPopularToday: true,
    isNew: true,
    growingPlaces: [place],
    difficulty: "BEGINNER",
    sowMonths: [11],
    transplantMonths: [12],
    harvestMonths: [1],
  });

  const neighbor = await createPublishedProductFixture(page, {
    namePrefix: "Neighbor month E2E", growingPlaces: [place], difficulty: "BEGINNER", sowMonths: [10],
  });
  const incomplete = await createPublishedProductFixture(page, {
    namePrefix: "Incomplete selector E2E", growingPlaces: [], sowMonths: [],
  });

  try {
    await page.goto("/selection");
    await page.getByRole("button", { name: new RegExp(place) }).click();
    await page.getByRole("button", { name: /Только начинаю/ }).click();
    await page.getByRole("button", { name: /Ноябрь/ }).click();

    await expect(page.getByText("Подходящие варианты", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: product.name, exact: true }).first()).toBeVisible();
    await expect(page.getByText(new RegExp(`подходит для «${place}`))).toBeVisible();
    await expect(page.getByRole("link", { name: neighbor.name, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: incomplete.name, exact: true })).toHaveCount(0);

    await page.getByRole("link", { name: "Открыть все совпадения в каталоге" }).click();
    await expect(page).toHaveURL(/\/catalog\?/);
    await expect(page.getByRole("link", { name: product.name, exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: neighbor.name, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: incomplete.name, exact: true })).toHaveCount(0);

    await page.goto("/calendar?month=12&mode=transplant");
    await expect(page.getByRole("heading", { name: /Что пересаживать в декабре/i })).toBeVisible();
    await expect(page.getByRole("link", { name: product.name, exact: true }).first()).toBeVisible();

    await page.goto("/calendar?month=1&mode=harvest");
    await expect(page.getByRole("heading", { name: /Что собирать в январе/i })).toBeVisible();
    await expect(page.getByRole("link", { name: product.name, exact: true }).first()).toBeVisible();
  } finally {
    await cleanupProductFixture(page, neighbor);
    await cleanupProductFixture(page, incomplete);
    await cleanupProductFixture(page, product);
  }
});
