import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const axePath = path.resolve(process.cwd(), "node_modules", "axe-core", "axe.min.js");

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
};

async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & {
      axe: { run: (root: Document, options: unknown) => Promise<{ violations: AxeViolation[] }> };
    }).axe;
    const result = await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
      resultTypes: ["violations"],
    });
    return result.violations;
  });

  return violations.filter((violation) =>
    violation.impact === "critical" || violation.impact === "serious"
  );
}

async function openHomepageWithClock(page: Page, viewport: { width: number; height: number }) {
  await page.clock.install();
  await page.setViewportSize(viewport);
  await page.goto("/", { waitUntil: "networkidle" });
  const browserTime = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(browserTime + 60_000);
}

test("axe не находит critical/serious проблем на ключевых desktop-страницах", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const route of ["/", "/catalog", "/sets", "/cart", "/faq"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    const violations = await seriousAxeViolations(page);
    expect(violations, `${route}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  }
});

test("axe не находит critical/serious проблем на mobile storefront", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/", "/catalog", "/sets"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    const violations = await seriousAxeViolations(page);
    expect(violations, `${route}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  }
});

for (const width of [320, 390, 480, 768, 1024, 1280, 1440]) {
  test(`header и главная помещаются в viewport ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });

    const pageWidth = await page.evaluate(() => ({
      viewport: window.innerWidth,
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(pageWidth.body).toBeLessThanOrEqual(pageWidth.viewport + 1);
    expect(pageWidth.document).toBeLessThanOrEqual(pageWidth.viewport + 1);

    const cart = page.getByRole("link", { name: /Корзина, товаров:/ }).first();
    await expect(cart).toBeVisible();
    const cartBox = await cart.boundingBox();
    expect(cartBox).not.toBeNull();
    expect((cartBox?.x ?? 0) + (cartBox?.width ?? 0)).toBeLessThanOrEqual(width + 1);

    const menuButton = page.getByRole("button", { name: /Открыть меню/ });
    if (width <= 1360) {
      await expect(menuButton).toBeVisible();
    } else {
      await expect(menuButton).toBeHidden();
    }

    if (width <= 420) {
      for (const control of [
        page.getByRole("button", { name: /Открыть поиск/ }),
        menuButton,
        cart,
      ]) {
        const box = await control.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
}

test("mobile header читабелен, а Enter сохраняет поисковый query", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });

  const menuButton = page.getByRole("button", { name: "Открыть меню" });
  await menuButton.click();
  const menuPanel = page.locator("#mobile-menu-panel");
  await expect(menuPanel).toBeVisible();
  const firstMenuLink = menuPanel.getByRole("link").first();
  await expect(firstMenuLink).toBeVisible();
  expect(await firstMenuLink.evaluate((element) => getComputedStyle(element).color)).not.toBe(
    "rgb(255, 255, 255)"
  );

  await page.getByRole("button", { name: "Открыть поиск" }).click();
  const mobileSearch = page.locator("#mobile-search-panel");
  const input = mobileSearch.getByRole("combobox", { name: "Поиск по каталогу" });
  await expect(input).toBeFocused();
  await input.fill("томат");
  await expect(mobileSearch.getByRole("listbox", { name: "Подсказки поиска" })).toBeVisible();
  await input.press("Escape");
  await expect(input).toHaveAttribute("aria-expanded", "false");

  await input.press("Enter");
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return { pathname: url.pathname, query: url.searchParams.get("q") };
    })
    .toEqual({ pathname: "/catalog", query: "томат" });
});

test("mobile поиск открывает выбранную клавиатурой подсказку", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Открыть поиск" }).click();
  const mobileSearch = page.locator("#mobile-search-panel");
  const input = mobileSearch.getByRole("combobox", { name: "Поиск по каталогу" });
  await input.fill("томат");
  await expect(mobileSearch.getByRole("listbox", { name: "Подсказки поиска" })).toBeVisible();

  await input.press("ArrowDown");
  const firstActiveId = await input.getAttribute("aria-activedescendant");
  expect(firstActiveId).toBeTruthy();
  await expect(page.locator(`[id="${firstActiveId}"]`)).toHaveAttribute("aria-selected", "true");

  await input.press("ArrowUp");
  const selectedId = await input.getAttribute("aria-activedescendant");
  expect(selectedId).toBeTruthy();
  expect(selectedId).not.toBe(firstActiveId);
  const selectedOption = page.locator(`[id="${selectedId}"]`);
  await expect(selectedOption).toHaveAttribute("aria-selected", "true");
  const selectedHref = await selectedOption.getAttribute("href");
  expect(selectedHref).toBeTruthy();
  const expectedUrl = new URL(selectedHref!, page.url());

  await Promise.all([
    page.waitForURL(
      (url) => url.pathname === expectedUrl.pathname && url.search === expectedUrl.search
    ),
    input.press("Enter"),
  ]);
});

test("мобильная карусель не движется сама и остаётся доступной вручную", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHomepageWithClock(page, { width: 390, height: 844 });

  const rail = page.getByLabel("Список популярных товаров");
  await rail.scrollIntoViewIfNeeded();
  await page.clock.runFor(100);
  await page.waitForTimeout(50);
  const initialPosition = await rail.evaluate((element) => element.scrollLeft);
  await page.clock.runFor(6_400);
  expect(await rail.evaluate((element) => element.scrollLeft)).toBe(initialPosition);

  await page.getByRole("button", { name: "Показать следующие популярные товары" }).click();
  await page.clock.runFor(500);
  expect(await rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(initialPosition);

  await rail.evaluate((element) => element.scrollTo({ left: 0, behavior: "instant" }));
  await rail.focus();
  await rail.press("ArrowRight");
  await page.clock.runFor(500);
  expect(await rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test("десктопная карусель запускается сама и останавливается после ручного шага", async ({
  page,
}) => {
  await openHomepageWithClock(page, { width: 1440, height: 900 });

  const rail = page.getByLabel("Список популярных товаров");
  await rail.scrollIntoViewIfNeeded();
  await page.clock.runFor(100);
  await page.waitForTimeout(50);
  const initialPosition = await rail.evaluate((element) => element.scrollLeft);

  await page.clock.runFor(6_400);
  await page.waitForTimeout(500);
  expect(await rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(initialPosition);

  await rail.evaluate((element) => element.scrollTo({ left: element.scrollWidth, behavior: "instant" }));
  await page.getByRole("button", { name: "Показать следующие популярные товары" }).click();
  expect(await rail.evaluate((element) => element.scrollLeft)).toBeLessThanOrEqual(4);

  const positionAfterManualStep = await rail.evaluate((element) => element.scrollLeft);
  await page.clock.runFor(6_400);
  expect(await rail.evaluate((element) => element.scrollLeft)).toBe(positionAfterManualStep);
});

test("десктопная карусель делает паузу при наведении и фокусе", async ({ page }) => {
  await openHomepageWithClock(page, { width: 1440, height: 900 });

  const rail = page.getByLabel("Список популярных товаров");
  await rail.scrollIntoViewIfNeeded();
  await rail.hover();
  await page.clock.runFor(100);
  await page.waitForTimeout(50);
  const initialPosition = await rail.evaluate((element) => element.scrollLeft);
  await page.clock.runFor(6_400);
  expect(await rail.evaluate((element) => element.scrollLeft)).toBe(initialPosition);

  await rail.focus();
  await page.mouse.move(0, 0);
  await page.clock.runFor(6_400);
  expect(await rail.evaluate((element) => element.scrollLeft)).toBe(initialPosition);
});

test("системное уменьшение движения отключает автоплей карусели", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHomepageWithClock(page, { width: 1440, height: 900 });

  const rail = page.getByLabel("Список популярных товаров");
  await rail.scrollIntoViewIfNeeded();
  await page.clock.runFor(100);
  await page.waitForTimeout(50);
  const initialPosition = await rail.evaluate((element) => element.scrollLeft);
  await page.clock.runFor(6_400);

  expect(await rail.evaluate((element) => element.scrollLeft)).toBe(initialPosition);
  expect(await rail.evaluate((element) => getComputedStyle(element).scrollBehavior)).toBe("auto");
});

test("полный скролл главной не даёт resource errors и лишних prefetch", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const browserProblems: string[] = [];
  const prefetchRequests = new Set<string>();

  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" || /preload.+not used/i.test(text)) {
      browserProblems.push(`${message.type()}: ${text}`);
    }
  });
  page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    browserProblems.push(`requestfailed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`);
  });
  page.on("request", (request) => {
    const headers = request.headers();
    if (request.url().includes("_rsc=") || headers["next-router-prefetch"] === "1") {
      prefetchRequests.add(request.url());
    }
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(300, innerHeight * 0.75)) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(800);

  expect(browserProblems).toEqual([]);
  expect(prefetchRequests.size).toBeLessThanOrEqual(30);
});

test("внутренние ссылки и отрисованные изображения storefront отвечают без ошибок", async ({ page, request }) => {
  const routes = ["/", "/catalog", "/sets", "/cart", "/faq"];
  const internalUrls = new Set<string>();
  const imageUrls = new Set<string>();

  for (const route of routes) {
    await page.goto(route, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);

    for (const href of await page.locator('a[href^="/"]').evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? "")
    )) {
      const [hrefWithoutHash] = href.split("#");
      if (hrefWithoutHash && !hrefWithoutHash.startsWith("//")) {
        internalUrls.add(hrefWithoutHash);
      }
    }
    for (const src of await page.locator("img").evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src)
    )) {
      if (src && !src.startsWith("data:")) imageUrls.add(src);
    }
  }

  for (const url of internalUrls) {
    const response = await request.get(url);
    expect(response.status(), `Broken internal link: ${url}`).toBeLessThan(400);
  }
  for (const url of imageUrls) {
    const response = await request.get(url);
    expect(response.status(), `Broken image: ${url}`).toBeLessThan(400);
    expect(response.headers()["content-type"], `Wrong image MIME: ${url}`).toContain("image/");
  }
});
