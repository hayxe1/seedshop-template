import { expect, type APIResponse, type Page } from "@playwright/test";
import type { CategoryRecord, ProductRecord } from "../../src/shared/api/contracts";
import { deleteTestProductFixtures } from "./test-database";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

type ProductFixtureOptions = {
  adminLoginIp?: string;
  namePrefix?: string;
  price?: number;
  stock?: number;
  inventoryPolicy?: ProductRecord["inventoryPolicy"];
  isPopularToday?: boolean;
  isNew?: boolean;
  growingPlaces?: string[];
  difficulty?: ProductRecord["difficulty"];
  sowMonths?: number[];
  transplantMonths?: number[];
  harvestMonths?: number[];
  packSize?: string;
  manufacturer?: string;
  mainImageUrl?: string;
  images?: { url: string; position: number }[];
};

async function parseResponse<T>(response: APIResponse, label: string): Promise<T> {
  const raw = await response.text();
  const parsed = JSON.parse(raw) as ApiResponse<T>;

  expect(response.ok(), `${label} failed with ${response.status()}: ${raw}`).toBeTruthy();
  expect(parsed.ok, `${label} returned an error: ${raw}`).toBe(true);

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return parsed.data;
}

async function ensureAdminApiSession(page: Page, adminLoginIp?: string) {
  const response = await page.request.post("/api/admin/login", {
    ...(adminLoginIp ? { headers: { "x-forwarded-for": adminLoginIp } } : {}),
    data: {
      email: "admin@seed-store.local",
      password: "change-me",
    },
  });

  await parseResponse(response, "Admin login");
}

async function getFixtureCategoryId(page: Page, adminLoginIp?: string) {
  await ensureAdminApiSession(page, adminLoginIp);

  const categories = await parseResponse<CategoryRecord[]>(
    await page.request.get("/api/admin/catalog/categories"),
    "Load admin categories"
  );
  const category = categories.find((item) => item.slug === "semena") ?? categories[0];

  if (!category) {
    throw new Error("No category is available for product fixture creation.");
  }

  return category.id;
}

export async function createPublishedProductFixture(
  page: Page,
  options: ProductFixtureOptions = {}
) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `${options.namePrefix ?? "Bulk Quantity E2E Product"} ${uniqueId}`;
  const slug = `e2e-bulk-quantity-${uniqueId}`;
  const categoryId = await getFixtureCategoryId(page, options.adminLoginIp);

  return parseResponse<ProductRecord>(
    await page.request.post("/api/admin/catalog/products", {
      data: {
        name,
        slug,
        description:
          "Temporary published product created by Playwright to verify stock confirmation flows.",
        shortDescription: "Temporary product for stock confirmation tests.",
        price: options.price ?? 99,
        mainImageUrl: options.mainImageUrl ?? "",
        packSize: options.packSize ?? "",
        manufacturer: options.manufacturer ?? "",
        plantingTips: "Created only for automated e2e checks.",
        categoryId,
        isPublished: true,
        isPopularToday: options.isPopularToday ?? false,
        isNew: options.isNew ?? false,
        seoTitle: "",
        seoDescription: "",
        stock: options.stock ?? 12,
        inventoryPolicy: options.inventoryPolicy ?? "TRACKED",
        growingPlaces: options.growingPlaces ?? [],
        difficulty: options.difficulty ?? null,
        sowMonths: options.sowMonths ?? [],
        transplantMonths: options.transplantMonths ?? [],
        harvestMonths: options.harvestMonths ?? [],
        images: options.images ?? [],
      },
    }),
    "Create product fixture"
  );
}

export async function cleanupProductFixture(page: Page, product: ProductRecord | null | undefined) {
  if (!product) {
    return;
  }

  void page;
  await deleteTestProductFixtures([product.slug]);
}
