import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { AssetRecord } from "@/shared/api/contracts";

export const PRODUCT_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const PRODUCT_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const imageRoot = path.resolve(process.cwd(), "public", "product-images");
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const uploadedAssetFolder = "Uploaded";

function dbAssetUrl(id: string) {
  return `/api/product-images/${encodeURIComponent(id)}`;
}

export function productImageAssetRecord(asset: { id: string; fileName: string }): AssetRecord {
  return {
    url: dbAssetUrl(asset.id),
    fileName: asset.fileName,
    folder: uploadedAssetFolder,
  };
}

async function getLegacyProductImageAssets(): Promise<AssetRecord[]> {
  try {
    const folders = await fs.readdir(imageRoot, { withFileTypes: true });
    const assets: AssetRecord[] = [];

    for (const folder of folders) {
      if (!folder.isDirectory()) {
        continue;
      }

      const folderPath = path.join(imageRoot, folder.name);
      const files = await fs.readdir(folderPath, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile()) {
          continue;
        }

        const extension = path.extname(file.name).toLowerCase();
        if (!allowedExtensions.has(extension)) {
          continue;
        }

        assets.push({
          url: `/product-images/${encodeURIComponent(folder.name)}/${encodeURIComponent(file.name)}`,
          fileName: file.name,
          folder: folder.name,
        });
      }
    }

    assets.sort((left, right) => {
      const byFolder = left.folder.localeCompare(right.folder, "ru");
      return byFolder || left.fileName.localeCompare(right.fileName, "ru");
    });

    return assets;
  } catch {
    return [];
  }
}

export async function getProductImageAssets(): Promise<AssetRecord[]> {
  const [uploadedAssets, legacyAssets] = await Promise.all([
    prisma.productImageAsset.findMany({
      select: {
        id: true,
        fileName: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    getLegacyProductImageAssets(),
  ]);

  return [...uploadedAssets.map(productImageAssetRecord), ...legacyAssets];
}
