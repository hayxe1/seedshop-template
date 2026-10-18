import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { revalidateStorefrontHome } from "@/lib/storefront-cache";
import { parseJsonBody, productBodySchema } from "@/shared/api/contracts";
import {
  fail,
  isUniqueError,
  normalizeImages,
  normalizeNonNegativeInt,
  normalizeMonthList,
  normalizeNullableStock,
  normalizeOptionalPositiveInt,
  normalizeOptionalString,
  normalizeSlug,
  normalizeString,
  normalizeStringList,
  ok,
  productDto,
  productSelect,
} from "../_shared";

export const dynamic = "force-dynamic";

const transliteration: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function parsePage(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function slugifyName(value: string) {
  const normalized = value
    .toLowerCase()
    .split("")
    .map((symbol) => transliteration[symbol] ?? symbol)
    .join("");

  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || `product-${Date.now().toString(36)}`;
}

async function createUniqueProductSlug(name: string) {
  const baseSlug = slugifyName(name);
  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function GET(request: Request) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const categoryId = (url.searchParams.get("categoryId") ?? "").trim();
  const published = (url.searchParams.get("published") ?? "").trim();
  const stock = (url.searchParams.get("stock") ?? "").trim();
  const image = (url.searchParams.get("image") ?? "").trim();
  const page = parsePage(url.searchParams.get("page"), 1);
  const pageSize = Math.min(100, parsePage(url.searchParams.get("pageSize"), 30));
  const skip = (page - 1) * pageSize;

  const where = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(published === "published"
      ? { isPublished: true }
      : published === "hidden"
        ? { isPublished: false }
        : {}),
    ...(stock === "low" ? { stock: { lte: 10, not: null } } : {}),
    ...(stock === "empty" ? { stock: 0 } : {}),
    ...(stock === "tracked" ? { stock: { not: null } } : {}),
    ...(image === "missing" ? { OR: [{ mainImageUrl: null }, { mainImageUrl: "" }] } : {}),
    ...(image === "present" ? { mainImageUrl: { not: null } } : {}),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: productSelect(),
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
    }),
  ]);

  return ok(
    products.map(productDto),
    undefined,
    {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  );
}

export async function POST(request: Request) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const bodyResult = await parseJsonBody(
      request,
      productBodySchema,
      "Заполните обязательные поля товара."
    );
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const body = bodyResult.data;
    const name = normalizeString(body.name);
    const requestedSlug = normalizeSlug(body.slug);
    const slug = requestedSlug || (name ? await createUniqueProductSlug(name) : "");
    const description = normalizeString(body.description);
    const price = normalizeNonNegativeInt(body.price);
    const categoryId = normalizeString(body.categoryId);
    const images = normalizeImages(body.images);
    const inventoryPolicy = body.inventoryPolicy ?? "TRACKED";

    if (!name || !description || price === null || !categoryId) {
      return fail(400, "VALIDATION_ERROR", "Заполните обязательные поля товара.");
    }

    const product = await prisma.product.create({
      data: {
        name,
        slug,
        description,
        shortDescription: normalizeOptionalString(body.shortDescription),
        price,
        mainImageUrl: normalizeOptionalString(body.mainImageUrl),
        plantingTips: normalizeOptionalString(body.plantingTips),
        categoryId,
        isPublished: Boolean(body.isPublished),
        isPopularToday: Boolean(body.isPopularToday),
        isNew: Boolean(body.isNew),
        seoTitle: normalizeOptionalString(body.seoTitle),
        seoDescription: normalizeOptionalString(body.seoDescription),
        stock: inventoryPolicy === "TRACKED" ? normalizeNullableStock(body.stock) : null,
        inventoryPolicy,
        manufacturer: normalizeOptionalString(body.manufacturer),
        packSize: normalizeOptionalString(body.packSize),
        growingPlaces: normalizeStringList(body.growingPlaces),
        difficulty: body.difficulty ?? null,
        maturityDays: normalizeOptionalPositiveInt(body.maturityDays),
        sowMonths: normalizeMonthList(body.sowMonths),
        transplantMonths: normalizeMonthList(body.transplantMonths),
        harvestMonths: normalizeMonthList(body.harvestMonths),
        lightRequirement: body.lightRequirement ?? null,
        regionTags: normalizeStringList(body.regionTags),
        ...(images.length > 0 ? { images: { createMany: { data: images } } } : {}),
      },
      select: productSelect(),
    });

    revalidateStorefrontHome();

    return ok(productDto(product), { status: 201 });
  } catch (error) {
    if (isUniqueError(error)) {
      return fail(409, "SLUG_CONFLICT", "Товар с таким адресом страницы уже существует.");
    }

    return fail(500, "CREATE_PRODUCT_FAILED", "Не удалось создать товар.");
  }
}
