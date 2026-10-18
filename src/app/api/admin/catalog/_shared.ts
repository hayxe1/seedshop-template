import { Prisma } from "@prisma/client";
import {
  fail,
  ok,
  productImageInputSchema,
  seedSetItemInputSchema,
  type CategoryBody,
  type CategoryRecord,
  type ProductBody,
  type ProductImageInput,
  type ProductRecord,
  type SeedSetBody,
  type SeedSetItemInput,
  type SeedSetRecord,
} from "@/shared/api/contracts";

export { fail, ok };
export type { CategoryBody, ProductBody, ProductImageInput, SeedSetBody, SeedSetItemInput };

export function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeOptionalString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || null;
}

export function normalizeSlug(value: unknown) {
  return normalizeString(value).toLowerCase();
}

export function normalizeNonNegativeInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed);
}

export function normalizeNullableStock(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.floor(parsed);
}

export function normalizeOptionalPositiveInt(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

export function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(normalizeString).filter((item) => item.length > 0))
  ).slice(0, 30);
}

export function normalizeMonthList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map(Number)
        .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
    )
  ).sort((left, right) => left - right);
}

export function normalizeImages(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((item, index) => {
      const image = productImageInputSchema.safeParse(item);
      if (!image.success) {
        return null;
      }

      const url = normalizeString(image.data.url);

      if (!url || seen.has(url)) {
        return null;
      }

      seen.add(url);

      const position =
        typeof image.data.position === "number" && Number.isFinite(image.data.position)
          ? Math.max(1, Math.floor(image.data.position))
          : index + 1;

      return { url, position };
    })
    .filter((item): item is { url: string; position: number } => Boolean(item));
}

export function normalizeSeedSetItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((item, index) => {
      const seedSetItem = seedSetItemInputSchema.safeParse(item);
      if (!seedSetItem.success) {
        return null;
      }

      const productId = normalizeString(seedSetItem.data.productId);

      if (!productId || seen.has(productId)) {
        return null;
      }

      seen.add(productId);

      const position =
        typeof seedSetItem.data.position === "number" && Number.isFinite(seedSetItem.data.position)
          ? Math.max(1, Math.floor(seedSetItem.data.position))
          : index + 1;

      return { productId, position };
    })
    .filter((item): item is { productId: string; position: number } => Boolean(item));
}

export function isUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function isNotFoundError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function productSelect() {
  return {
    id: true,
    name: true,
    slug: true,
    description: true,
    shortDescription: true,
    price: true,
    mainImageUrl: true,
    plantingTips: true,
    categoryId: true,
    isPublished: true,
    isPopularToday: true,
    isNew: true,
    seoTitle: true,
    seoDescription: true,
    stock: true,
    inventoryPolicy: true,
    manufacturer: true,
    packSize: true,
    growingPlaces: true,
    difficulty: true,
    maturityDays: true,
    sowMonths: true,
    transplantMonths: true,
    harvestMonths: true,
    lightRequirement: true,
    regionTags: true,
    createdAt: true,
    updatedAt: true,
    category: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    images: {
      select: {
        id: true,
        url: true,
        position: true,
      },
      orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
    },
    _count: {
      select: {
        orderItems: true,
        seedSetItems: true,
      },
    },
  };
}

type ProductPayload = Prisma.ProductGetPayload<{ select: ReturnType<typeof productSelect> }>;

export function productDto(product: ProductPayload): ProductRecord {
  return {
    ...product,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function categorySelect() {
  return {
    id: true,
    name: true,
    slug: true,
    description: true,
    seoTitle: true,
    seoDescription: true,
    createdAt: true,
    updatedAt: true,
    _count: {
      select: {
        products: true,
      },
    },
  };
}

type CategoryPayload = Prisma.CategoryGetPayload<{ select: ReturnType<typeof categorySelect> }>;

export function categoryDto(category: CategoryPayload): CategoryRecord {
  return {
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export function seedSetSelect() {
  return {
    id: true,
    slug: true,
    isPublished: true,
    publishedAt: true,
    draftVersion: true,
    publishedVersion: true,
    createdAt: true,
    updatedAt: true,
    revisions: {
      select: {
        id: true,
        role: true,
        name: true,
        description: true,
        shortDescription: true,
        imageUrl: true,
        price: true,
        seoTitle: true,
        seoDescription: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            id: true,
            productId: true,
            position: true,
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                price: true,
                stock: true,
                mainImageUrl: true,
                isPublished: true,
              },
            },
          },
          orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
        },
      },
      orderBy: [{ createdAt: "asc" as const }],
    },
  };
}

type SeedSetPayload = Prisma.SeedSetGetPayload<{ select: ReturnType<typeof seedSetSelect> }>;

export function getSeedSetReadiness(seedSet: SeedSetPayload) {
  const draft =
    seedSet.revisions.find((revision) => revision.role === "DRAFT") ??
    seedSet.revisions.find((revision) => revision.role === "PUBLISHED");

  if (!draft) {
    return [
      {
        key: "draft",
        label: "Черновик создан",
        passed: false,
      },
    ];
  }

  return [
    {
      key: "name",
      label: "Название заполнено",
      passed: draft.name.trim().length >= 3,
    },
    {
      key: "slug",
      label: "Адрес страницы корректен",
      passed: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seedSet.slug),
    },
    {
      key: "description",
      label: "Описание заполнено",
      passed: draft.description.trim().length >= 10,
    },
    {
      key: "price",
      label: "Цена больше нуля",
      passed: draft.price > 0,
    },
    {
      key: "image",
      label: "Обложка выбрана",
      passed: Boolean(draft.imageUrl?.trim()),
    },
    {
      key: "items",
      label: "В составе есть товары",
      passed: draft.items.length > 0,
    },
    {
      key: "products",
      label: "Все товары опубликованы",
      passed: draft.items.length > 0 && draft.items.every((item) => item.product.isPublished),
    },
  ];
}

export function seedSetDto(seedSet: SeedSetPayload): SeedSetRecord {
  const draft =
    seedSet.revisions.find((revision) => revision.role === "DRAFT") ??
    seedSet.revisions.find((revision) => revision.role === "PUBLISHED");
  const published = seedSet.revisions.find((revision) => revision.role === "PUBLISHED");

  if (!draft) {
    throw new Error(`Seed set ${seedSet.id} has no editable revision.`);
  }

  const readiness = getSeedSetReadiness(seedSet);
  const hasPublishedVersion = Boolean(published);
  const hasUnpublishedChanges =
    !hasPublishedVersion || seedSet.draftVersion !== seedSet.publishedVersion;
  const publicationStatus = !seedSet.isPublished
    ? hasPublishedVersion
      ? "HIDDEN"
      : "DRAFT"
    : hasUnpublishedChanges
      ? "PUBLISHED_WITH_CHANGES"
      : "PUBLISHED";

  return {
    id: seedSet.id,
    slug: seedSet.slug,
    name: draft.name,
    description: draft.description,
    shortDescription: draft.shortDescription,
    imageUrl: draft.imageUrl,
    price: draft.price,
    isPublished: seedSet.isPublished,
    publicationStatus,
    hasPublishedVersion,
    hasUnpublishedChanges,
    isReadyToPublish: readiness.every((item) => item.passed),
    isSlugLocked: hasPublishedVersion,
    readiness,
    draftVersion: seedSet.draftVersion,
    publishedVersion: seedSet.publishedVersion,
    publishedAt: seedSet.publishedAt?.toISOString() ?? null,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
    createdAt: seedSet.createdAt.toISOString(),
    updatedAt: seedSet.updatedAt.toISOString(),
    items: draft.items,
  };
}
