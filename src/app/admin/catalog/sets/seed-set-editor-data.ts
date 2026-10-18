import { InventoryPolicy, SeedSetRevisionRole } from "@prisma/client";
import { seedSetDto, seedSetSelect } from "@/app/api/admin/catalog/_shared";
import type { CatalogSeedSet } from "@/entities/product/model/catalog-data";
import { prisma } from "@/lib/prisma";
import { getProductImageAssets } from "@/lib/product-image-assets";
import type { AssetRecord } from "@/shared/api/contracts";

export type SeedSetProductChoice = {
  id: string;
  name: string;
  slug: string;
  price: number;
  stock: number | null;
  inventoryPolicy: InventoryPolicy;
  mainImageUrl: string | null;
  isPublished: boolean;
};

export async function getSeedSetEditorProducts(): Promise<SeedSetProductChoice[]> {
  return prisma.product.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      stock: true,
      inventoryPolicy: true,
      mainImageUrl: true,
      isPublished: true,
    },
    orderBy: [{ isPublished: "desc" }, { name: "asc" }],
  });
}

export async function getSeedSetEditorAssets(): Promise<AssetRecord[]> {
  return getProductImageAssets().catch(() => []);
}

export async function getSeedSetEditorSeedSet(id: string) {
  const seedSet = await prisma.seedSet.findUnique({
    where: { id },
    select: seedSetSelect(),
  });

  return seedSet ? seedSetDto(seedSet) : null;
}

export async function getSeedSetDraftPreview(id: string): Promise<CatalogSeedSet | null> {
  const seedSet = await prisma.seedSet.findUnique({
    where: { id },
    include: {
      revisions: {
        where: { role: SeedSetRevisionRole.DRAFT },
        take: 1,
        include: {
          items: {
            include: { product: true },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  const revision = seedSet?.revisions[0];

  if (!seedSet || !revision) {
    return null;
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

  return {
    id: seedSet.id,
    slug: seedSet.slug,
    name: revision.name,
    description: revision.description,
    shortDescription: revision.shortDescription,
    imageUrl: revision.imageUrl,
    price: revision.price,
    itemsTotalPrice: items.reduce((sum, item) => sum + item.price, 0),
    seoTitle: revision.seoTitle,
    seoDescription: revision.seoDescription,
    items,
    isAvailable: items.length > 0 && items.every((item) => item.isAvailable),
    updatedAt: revision.updatedAt,
  };
}
