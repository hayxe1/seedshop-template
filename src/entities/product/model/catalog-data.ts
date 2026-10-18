import "server-only";
import { cache } from "react";
import {
  InventoryPolicy,
  LightRequirement,
  Prisma,
  SeedDifficulty,
  SeedSetRevisionRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProductSearchWhere } from "./catalog-search-where";

export type CatalogImage = {
  url: string;
  width: number;
  height: number;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  shortDescription: string;
  category: string;
  categorySlug: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  packLabel: string;
  price: number;
  stock: number | null;
  inventoryPolicy: InventoryPolicy;
  isAvailable: boolean;
  manufacturer: string | null;
  packSize: string | null;
  growingPlaces: string[];
  difficulty: SeedDifficulty | null;
  maturityDays: number | null;
  sowMonths: number[];
  transplantMonths: number[];
  harvestMonths: number[];
  lightRequirement: LightRequirement | null;
  regionTags: string[];
  gallery: CatalogImage[];
  isPopularToday: boolean;
  isNew: boolean;
  plantingTips: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: Date;
};

export const CATALOG_PAGE_SIZE = 16;

export type CatalogSort = "popular" | "newest" | "price-asc" | "price-desc" | "name";

export type CatalogQuery = {
  q?: string;
  category?: string | string[];
  manufacturer?: string | string[];
  priceFrom?: number | undefined;
  priceTo?: number | undefined;
  availableOnly?: boolean;
  growingPlace?: string;
  sowMonth?: number | undefined;
  transplantMonth?: number | undefined;
  harvestMonth?: number | undefined;
  difficulty?: SeedDifficulty | undefined;
  sort?: CatalogSort;
  page?: number;
  pageSize?: number;
};

export type CatalogQueryResult = {
  items: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CatalogFilterOptions = {
  manufacturers: string[];
  growingPlaces: string[];
  sowMonths: number[];
  difficulties: SeedDifficulty[];
  minimumPrice: number;
  maximumPrice: number;
};

export type CatalogCategory = {
  name: string;
  slug: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type CatalogSeedSetItem = {
  productId: string;
  slug: string;
  name: string;
  price: number;
  stock: number | null;
  inventoryPolicy: InventoryPolicy;
  isPublished: boolean;
  isAvailable: boolean;
  imageUrl?: string;
};

export type CatalogSeedSet = {
  id: string;
  slug: string;
  name: string;
  description: string;
  shortDescription: string | null;
  imageUrl: string | null;
  price: number;
  itemsTotalPrice: number;
  seoTitle: string | null;
  seoDescription: string | null;
  items: CatalogSeedSetItem[];
  isAvailable: boolean;
  updatedAt: Date;
};

export const DEPRECATED_VEGETABLES_CATEGORY_SLUG = "ovoshchi";
const DEMO_MANUFACTURERS = ["Производитель 1", "Производитель 2"];

const PRIMARY_CATEGORY_ORDER = ["tomaty", "ogurtsy", "pertsy", "svekla", "kukuruza", "morkov"];
const primaryCategoryOrderBySlug = new Map(
  PRIMARY_CATEGORY_ORDER.map((slug, index) => [slug, index])
);

function sortCatalogCategories<T extends { name: string; slug: string }>(categories: T[]) {
  return [...categories].sort((left, right) => {
    const leftOrder = primaryCategoryOrderBySlug.get(left.slug) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = primaryCategoryOrderBySlug.get(right.slug) ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.name.localeCompare(right.name, "ru");
  });
}

function getImageSize(imageUrl: string | null | undefined) {
  const match = imageUrl ? /\/(\d+)x(\d+)\//i.exec(imageUrl) : null;

  if (!match) {
    return {
      width: 105,
      height: 160,
    };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function buildPackLabel(packSize: string | null | undefined) {
  return packSize?.trim() || "Фасовка уточняется";
}

type CatalogProductRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  shortDescription: string | null;
  price: number;
  stock: number | null;
  inventoryPolicy: InventoryPolicy;
  manufacturer: string | null;
  packSize: string | null;
  growingPlaces: string[];
  difficulty: SeedDifficulty | null;
  maturityDays: number | null;
  sowMonths: number[];
  transplantMonths: number[];
  harvestMonths: number[];
  lightRequirement: LightRequirement | null;
  regionTags: string[];
  isPopularToday: boolean;
  isNew: boolean;
  mainImageUrl: string | null;
  plantingTips: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: Date;
  category: {
    name: string;
    slug: string;
  };
  images?: Array<{
    url: string;
    position: number | null;
  }>;
};

function mapProduct(product: CatalogProductRecord) {
  const image = getImageSize(product.mainImageUrl);
  const imageUrl = product.mainImageUrl || "/file.svg";
  const galleryUrls = [
    imageUrl,
    ...(product.images ?? [])
      .map((item) => item.url)
      .filter((url) => url && url !== imageUrl),
  ];

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    shortDescription: product.shortDescription?.trim() || product.description,
    category: product.category.name,
    categorySlug: product.category.slug,
    imageUrl,
    imageWidth: image.width,
    imageHeight: image.height,
    packLabel: buildPackLabel(product.packSize),
    price: product.price,
    stock: product.stock,
    inventoryPolicy: product.inventoryPolicy,
    isAvailable: true,
    manufacturer: product.manufacturer,
    packSize: product.packSize,
    growingPlaces: product.growingPlaces,
    difficulty: product.difficulty,
    maturityDays: product.maturityDays,
    sowMonths: product.sowMonths,
    transplantMonths: product.transplantMonths,
    harvestMonths: product.harvestMonths,
    lightRequirement: product.lightRequirement,
    regionTags: product.regionTags,
    gallery: galleryUrls.map((url) => {
      const size = getImageSize(url);
      return { url, width: size.width, height: size.height };
    }),
    isPopularToday: product.isPopularToday,
    isNew: product.isNew,
    plantingTips: product.plantingTips,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    updatedAt: product.updatedAt,
  } satisfies CatalogProduct;
}

const getPublishedProductsCached = cache(async (): Promise<CatalogProduct[]> => {
  const products = await prisma.product.findMany({
    where: {
      isPublished: true,
    },
    include: {
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return products.map(mapProduct);
});

const getPopularTodayProductsCached = cache(async (limit: number): Promise<CatalogProduct[]> => {
  const products = await prisma.product.findMany({
    where: {
      isPublished: true,
      isPopularToday: true,
    },
    include: {
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return products.map(mapProduct);
});

const getCatalogPreviewProductsCached = cache(async (limit: number): Promise<CatalogProduct[]> => {
  const products = await prisma.product.findMany({
    where: {
      isPublished: true,
    },
    include: {
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return products.map(mapProduct);
});

const getPublishedSeedSetsCached = cache(async (): Promise<CatalogSeedSet[]> => {
  const seedSets = await prisma.seedSet.findMany({
    where: {
      isPublished: true,
      revisions: { some: { role: SeedSetRevisionRole.PUBLISHED } },
    },
    include: {
      revisions: {
        where: { role: SeedSetRevisionRole.PUBLISHED },
        take: 1,
        include: {
          items: {
            include: {
              product: true,
            },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
  });

  return seedSets.flatMap((seedSet) => {
    const revision = seedSet.revisions[0];
    if (!revision) {
      return [];
    }

    const items = revision.items.map((item) => ({
      productId: item.product.id,
      slug: item.product.slug,
      name: item.product.name,
      price: item.product.price,
      stock: item.product.stock,
      inventoryPolicy: item.product.inventoryPolicy,
      isPublished: item.product.isPublished,
      isAvailable: item.product.isPublished,
      ...(item.product.mainImageUrl ? { imageUrl: item.product.mainImageUrl } : {}),
    }));

    const computedPrice = items.reduce((sum, item) => sum + item.price, 0);

    return [
      {
        id: seedSet.id,
        slug: seedSet.slug,
        name: revision.name,
        description: revision.description,
        shortDescription: revision.shortDescription,
        imageUrl: revision.imageUrl,
        price: revision.price,
        itemsTotalPrice: computedPrice,
        seoTitle: revision.seoTitle,
        seoDescription: revision.seoDescription,
        items,
        isAvailable: items.length > 0 && items.every((item) => item.isAvailable),
        updatedAt: revision.updatedAt,
      } satisfies CatalogSeedSet,
    ];
  });
});

export async function getCatalogProducts(): Promise<CatalogProduct[]> {
  return getPublishedProductsCached();
}

export async function getPopularTodayProducts(limit = 8): Promise<CatalogProduct[]> {
  return getPopularTodayProductsCached(limit);
}

export async function getCatalogPreviewProducts(limit = 16): Promise<CatalogProduct[]> {
  return getCatalogPreviewProductsCached(limit);
}

export async function getCatalogProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const product = await prisma.product.findFirst({
    where: {
      slug,
      isPublished: true,
    },
    include: {
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
      images: {
        select: {
          url: true,
          position: true,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return product ? mapProduct(product) : null;
}

function getCatalogOrderBy(sort: CatalogSort | undefined): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ price: "asc" }, { name: "asc" }];
    case "price-desc":
      return [{ price: "desc" }, { name: "asc" }];
    case "name":
      return [{ name: "asc" }];
    case "newest":
      return [{ isNew: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }];
    case "popular":
    default:
      return [{ isPopularToday: "desc" }, { isNew: "desc" }, { updatedAt: "desc" }];
  }
}

function buildCatalogWhere(query: CatalogQuery): Prisma.ProductWhereInput {
  const categorySlugs = Array.isArray(query.category)
    ? query.category
    : query.category
      ? [query.category]
      : [];
  const manufacturers = Array.from(
    new Set(
      (Array.isArray(query.manufacturer)
        ? query.manufacturer
        : query.manufacturer
          ? [query.manufacturer]
          : [])
        .map((manufacturer) => manufacturer.trim())
        .filter((manufacturer) => manufacturer.length > 0)
    )
  ).slice(0, 24);
  const and: Prisma.ProductWhereInput[] = query.q?.trim() ? [getProductSearchWhere(query.q)] : [];

  if (query.availableOnly) {
    and.push({
      OR: [
        { inventoryPolicy: { in: [InventoryPolicy.PREORDER, InventoryPolicy.UNLIMITED] } },
        { inventoryPolicy: InventoryPolicy.TRACKED, stock: { gt: 0 } },
      ],
    });
  }

  return {
    isPublished: true,
    ...(categorySlugs.length > 0 ? { category: { slug: { in: categorySlugs } } } : {}),
    ...(manufacturers.length > 0 ? { manufacturer: { in: manufacturers } } : {}),
    ...(query.priceFrom !== undefined || query.priceTo !== undefined
      ? {
          price: {
            ...(query.priceFrom !== undefined ? { gte: query.priceFrom } : {}),
            ...(query.priceTo !== undefined ? { lte: query.priceTo } : {}),
          },
        }
      : {}),
    ...(query.growingPlace ? { growingPlaces: { has: query.growingPlace } } : {}),
    ...(query.sowMonth ? { sowMonths: { has: query.sowMonth } } : {}),
    ...(query.transplantMonth
      ? { transplantMonths: { has: query.transplantMonth } }
      : {}),
    ...(query.harvestMonth ? { harvestMonths: { has: query.harvestMonth } } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

export async function queryCatalogProducts(query: CatalogQuery): Promise<CatalogQueryResult> {
  const pageSize = Math.min(48, Math.max(1, query.pageSize ?? CATALOG_PAGE_SIZE));
  const requestedPage = Math.max(1, query.page ?? 1);
  const where = buildCatalogWhere(query);
  const total = await prisma.product.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const products = await prisma.product.findMany({
    where,
    include: {
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
    orderBy: getCatalogOrderBy(query.sort),
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: products.map(mapProduct),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getCatalogFilterOptions(): Promise<CatalogFilterOptions> {
  const [products, priceRange] = await Promise.all([
    prisma.product.findMany({
      where: { isPublished: true },
      select: {
        manufacturer: true,
        growingPlaces: true,
        sowMonths: true,
        difficulty: true,
      },
    }),
    prisma.product.aggregate({
      where: { isPublished: true },
      _min: { price: true },
      _max: { price: true },
    }),
  ]);

  return {
    manufacturers: Array.from(
      new Set([
        ...DEMO_MANUFACTURERS,
        ...products.flatMap((product) => {
          const manufacturer = product.manufacturer?.trim();
          return manufacturer ? [manufacturer] : [];
        }),
      ])
    ).sort((left, right) => left.localeCompare(right, "ru")),
    growingPlaces: Array.from(new Set(products.flatMap((product) => product.growingPlaces))).sort(
      (left, right) => left.localeCompare(right, "ru")
    ),
    sowMonths: Array.from(new Set(products.flatMap((product) => product.sowMonths))).sort(
      (left, right) => left - right
    ),
    difficulties: Array.from(
      new Set(products.flatMap((product) => (product.difficulty ? [product.difficulty] : [])))
    ),
    minimumPrice: priceRange._min.price ?? 0,
    maximumPrice: priceRange._max.price ?? 0,
  };
}

export async function getCatalogCategoryList(): Promise<CatalogCategory[]> {
  const categories = await prisma.category.findMany({
    where: {
      slug: {
        not: DEPRECATED_VEGETABLES_CATEGORY_SLUG,
      },
      products: {
        some: {
          isPublished: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
    select: {
      name: true,
      slug: true,
      description: true,
      seoTitle: true,
      seoDescription: true,
    },
  });

  return sortCatalogCategories(categories).map((category) => ({
    name: category.name,
    slug: category.slug,
    description: category.description,
    seoTitle: category.seoTitle,
    seoDescription: category.seoDescription,
  })) satisfies CatalogCategory[];
}

export async function getCatalogCategoryBySlug(slug: string): Promise<CatalogCategory | null> {
  if (slug === DEPRECATED_VEGETABLES_CATEGORY_SLUG) {
    return null;
  }

  const category = await prisma.category.findFirst({
    where: {
      slug,
      products: {
        some: {
          isPublished: true,
        },
      },
    },
    select: {
      name: true,
      slug: true,
      description: true,
      seoTitle: true,
      seoDescription: true,
    },
  });

  if (!category) {
    return null;
  }

  return {
    name: category.name,
    slug: category.slug,
    description: category.description,
    seoTitle: category.seoTitle,
    seoDescription: category.seoDescription,
  } satisfies CatalogCategory;
}

export async function getRelatedCatalogProducts(
  product: CatalogProduct,
  limit = 4
): Promise<CatalogProduct[]> {
  const candidateRecords = await prisma.product.findMany({
    where: {
      isPublished: true,
      id: { not: product.id },
    },
    include: {
      category: { select: { name: true, slug: true } },
    },
    orderBy: [{ isPopularToday: "desc" }, { updatedAt: "desc" }],
    take: Math.max(24, limit * 8),
  });
  const sourcePlaces = new Set(product.growingPlaces.map((value) => value.toLocaleLowerCase("ru-RU")));
  const sourceSowMonths = new Set(product.sowMonths);
  const sourceRegions = new Set(product.regionTags.map((value) => value.toLocaleLowerCase("ru-RU")));

  return candidateRecords
    .map(mapProduct)
    .map((candidate) => {
      const score =
        (candidate.categorySlug === product.categorySlug ? 10 : 0) +
        candidate.growingPlaces.filter((value) =>
          sourcePlaces.has(value.toLocaleLowerCase("ru-RU"))
        ).length *
          3 +
        candidate.sowMonths.filter((month) => sourceSowMonths.has(month)).length * 2 +
        candidate.regionTags.filter((value) =>
          sourceRegions.has(value.toLocaleLowerCase("ru-RU"))
        ).length *
          2 +
        (candidate.difficulty && candidate.difficulty === product.difficulty ? 3 : 0) +
        (candidate.lightRequirement &&
        candidate.lightRequirement === product.lightRequirement
          ? 2
          : 0) +
        (candidate.isPopularToday ? 2 : 0) +
        (candidate.isNew ? 1 : 0);

      return { candidate, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.candidate.isPopularToday) - Number(left.candidate.isPopularToday) ||
        left.candidate.name.localeCompare(right.candidate.name, "ru")
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export async function getPublishedSeedSets(): Promise<CatalogSeedSet[]> {
  return getPublishedSeedSetsCached();
}

export async function getCatalogSeedSetBySlug(slug: string): Promise<CatalogSeedSet | null> {
  const seedSets = await getPublishedSeedSetsCached();
  return seedSets.find((seedSet) => seedSet.slug === slug) ?? null;
}

export async function getFeaturedSeedSets(limit = 3): Promise<CatalogSeedSet[]> {
  const seedSets = await getPublishedSeedSetsCached();
  return seedSets.slice(0, limit);
}
