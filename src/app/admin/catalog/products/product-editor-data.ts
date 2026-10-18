import { prisma } from "@/lib/prisma";
import { getProductImageAssets } from "@/lib/product-image-assets";
import type { AssetRecord } from "@/shared/api/contracts";
import {
  categoryDto,
  categorySelect,
  productDto,
  productSelect,
} from "@/app/api/admin/catalog/_shared";

export async function getProductEditorCategories() {
  const categories = await prisma.category.findMany({
    select: categorySelect(),
    orderBy: [{ name: "asc" }],
  });

  return categories.map(categoryDto);
}

export async function getProductEditorAssets(): Promise<AssetRecord[]> {
  return getProductImageAssets().catch(() => []);
}

export async function getProductEditorProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: productSelect(),
  });

  return product ? productDto(product) : null;
}
