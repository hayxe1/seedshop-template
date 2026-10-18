import { test, expect } from "@playwright/test";
import path from "node:path";
import { createPublishedProductFixture as createProduct, cleanupProductFixture } from "./product-fixtures";
import type { Page } from "@playwright/test";

const createPublishedProductFixture = (page: Page, options: Parameters<typeof createProduct>[1] = {}) =>
  createProduct(page, { ...options, adminLoginIp: "198.18.8.51" });

test("три экрана: узкие размеры, порядок товара, контраст и семантика основных областей", async ({ page }) => {
  test.setTimeout(120000);
  const product = await createPublishedProductFixture(page, { namePrefix: "Очень длинное русское название демонстрационного товара для проверки переноса и фасовки", packSize: "20 семян", mainImageUrl: "/product-images/demo/package.png" });
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const url of ["/catalog", `/product/${product.slug}`, `/admin/catalog/products/${product.id}`]) {
        await page.goto(url, { waitUntil: "networkidle" });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${url}, ${width}px`).toBe(true);
        if (url.startsWith("/product/") && width <= 768) {
          const title = await page.locator("main h1").boundingBox();
          const image = await page.locator("main img").first().boundingBox();
          expect(title!.y + title!.height).toBeLessThan(image!.y);
        }
        if (width === 390 || width === 1440) {
          await page.addScriptTag({ path: path.resolve("node_modules/axe-core/axe.min.js") });
          const violations = await page.evaluate(async () => {
            const axe = (window as unknown as { axe: { run: (context: string, options: object) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }> }> } }).axe;
            const result = await axe.run("main", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
            return result.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }));
          });
          expect(violations, `${url}, ${width}px; automated check, not full WCAG certification`).toEqual([]);
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/product/${product.slug}`);
    const input = page.getByTestId("product-quantity-input"); await expect(input).toBeEnabled(); await input.focus(); await input.press("ArrowUp");
    await expect(input).toBeFocused(); const box = await input.boundingBox(); expect(box!.y + box!.height).toBeLessThan(844 - 72);
    await input.press("Tab"); await expect(page.getByRole("button", { name: "Увеличить количество", exact: true })).toBeFocused();
  } finally { await cleanupProductFixture(page, product); }
});

test("диагностическое удвоение текста не создаёт горизонтального переполнения трёх экранов", async ({ page }) => {
  test.setTimeout(90000);
  const product = await createPublishedProductFixture(page, { mainImageUrl: "/product-images/demo/package.png" });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of ["/catalog", `/product/${product.slug}`, `/admin/catalog/products/${product.id}`]) {
      await page.goto(url, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        const entries = [...document.querySelectorAll("main *")].map(el => [el, parseFloat(getComputedStyle(el).fontSize)] as const);
        for (const [el, size] of entries) if (el instanceof HTMLElement && Number.isFinite(size)) el.style.fontSize = `${size * 2}px`;
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${url}: CSS text stress, not native zoom`).toBe(true);
    }
  } finally { await cleanupProductFixture(page, product); }
});
