import { expect, test } from "@playwright/test";

async function getUniqueProductHrefs(page: import("@playwright/test").Page) {
  return page.locator('a[href^="/product/"]').evaluateAll((links) => {
    const hrefs = links
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => Boolean(href));

    return [...new Set(hrefs)];
  });
}

async function getUniqueProductImageHrefs(page: import("@playwright/test").Page) {
  return page.locator('a[href^="/product/"]').evaluateAll((links) => {
    const hrefs = links
      .filter((link) => {
        const image = link.querySelector("img");
        const imageUrl = image?.getAttribute("src") ?? "";

        return imageUrl.includes("/product-images/") || imageUrl.includes("%2Fproduct-images");
      })
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => Boolean(href));

    return [...new Set(hrefs)];
  });
}

test("product-to-product navigation resets scroll and keeps related images sharp", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto("/catalog");

  const catalogHrefs = await getUniqueProductImageHrefs(page);
  expect(catalogHrefs.length).toBeGreaterThanOrEqual(1);

  const catalogHref = catalogHrefs[0];
  expect(catalogHref).toBeDefined();

  await page.goto(catalogHref!);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(50);

  const relatedHrefs = await getUniqueProductHrefs(page);
  expect(relatedHrefs.length).toBeGreaterThanOrEqual(1);

  const relatedHref = relatedHrefs.find((href) => href !== catalogHref);
  expect(relatedHref).toBeDefined();

  const relatedLink = page.locator(`main a[href="${relatedHref}"]`).first();
  await relatedLink.click();
  await expect(page).toHaveURL(new RegExp(`${relatedHref}$`));

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(20);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const optimizedWidth = await page
    .locator('main a[href^="/product/"] img')
    .first()
    .evaluate((image) => {
      const currentSource = new URL((image as HTMLImageElement).currentSrc);
      return Number(currentSource.searchParams.get("w"));
    });

  expect(optimizedWidth).toBeGreaterThanOrEqual(256);
});
