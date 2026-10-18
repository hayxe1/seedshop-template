import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  getProductImageAssets,
  productImageAssetRecord,
  PRODUCT_IMAGE_CONTENT_TYPES,
  PRODUCT_IMAGE_MAX_SIZE_BYTES,
} from "@/lib/product-image-assets";
import { fail, ok } from "../../catalog/_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    return ok(await getProductImageAssets());
  } catch {
    return fail(500, "ASSETS_READ_FAILED", "Не удалось загрузить библиотеку изображений.");
  }
}

export async function POST(request: Request) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return fail(400, "IMAGE_FILE_REQUIRED", "Выберите файл изображения.");
    }

    if (!PRODUCT_IMAGE_CONTENT_TYPES.has(file.type)) {
      return fail(400, "IMAGE_TYPE_NOT_ALLOWED", "Можно загружать только JPG, PNG, WEBP или AVIF.");
    }

    if (file.size <= 0) {
      return fail(400, "IMAGE_FILE_EMPTY", "Файл изображения пустой.");
    }

    if (file.size > PRODUCT_IMAGE_MAX_SIZE_BYTES) {
      return fail(413, "IMAGE_FILE_TOO_LARGE", "Файл изображения должен быть не больше 5 MB.");
    }

    const data = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.trim().replace(/[\\/]/g, "") || "product-image";
    const asset = await prisma.productImageAsset.create({
      data: {
        fileName,
        contentType: file.type,
        sizeBytes: file.size,
        data,
      },
      select: {
        id: true,
        fileName: true,
      },
    });

    return ok(productImageAssetRecord(asset), { status: 201 });
  } catch {
    return fail(500, "IMAGE_UPLOAD_FAILED", "Не удалось загрузить изображение.");
  }
}
