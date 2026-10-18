import { InventoryMovementReason, Prisma } from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { revalidateStorefrontHome } from "@/lib/storefront-cache";
import { parseJsonBody, productBodySchema } from "@/shared/api/contracts";
import {
  fail,
  isNotFoundError,
  isUniqueError,
  normalizeImages,
  normalizeMonthList,
  normalizeNonNegativeInt,
  normalizeNullableStock,
  normalizeOptionalPositiveInt,
  normalizeOptionalString,
  normalizeSlug,
  normalizeString,
  normalizeStringList,
  ok,
  productDto,
  productSelect,
} from "../../_shared";

class StaleProductError extends Error {}

function productInUseResponse(productName: string) {
  return fail(
    409,
    "PRODUCT_IN_USE",
    `Товар "${productName}" нельзя удалить, потому что он используется в заказах или наборах. Снимите его с публикации, чтобы скрыть с витрины.`
  );
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const { id } = await context.params;
    const expectedVersion = request.headers.get("If-Match")?.replace(/^"|"$/g, "");
    if (!expectedVersion || !Number.isFinite(Date.parse(expectedVersion))) {
      return fail(428, "PRODUCT_VERSION_REQUIRED", "Откройте актуальную версию товара перед сохранением.");
    }
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
    const slug = normalizeSlug(body.slug);
    const description = normalizeString(body.description);
    const price = normalizeNonNegativeInt(body.price);
    const categoryId = normalizeString(body.categoryId);
    const images = normalizeImages(body.images);
    const inventoryPolicy = body.inventoryPolicy ?? "TRACKED";
    const nextStock =
      inventoryPolicy === "TRACKED" ? normalizeNullableStock(body.stock) : null;

    if (!name || !slug || !description || price === null || !categoryId) {
      return fail(400, "VALIDATION_ERROR", "Заполните обязательные поля товара.");
    }

    const product = await prisma.$transaction(async (tx) => {
      // Serialize with edits and stock updates before reading the version or writing any dependent rows.
      await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`;
      const previous = await tx.product.findUniqueOrThrow({
        where: { id },
        select: { stock: true, updatedAt: true },
      });
      if (previous.updatedAt.toISOString() !== expectedVersion) throw new StaleProductError();
      await tx.product.update({
        where: { id },
        data: {
          updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)),
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
          stock: nextStock,
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
        },
      });

      if (
        inventoryPolicy === "TRACKED" &&
        nextStock !== null &&
        (previous.stock ?? 0) !== nextStock
      ) {
        await tx.inventoryMovement.create({
          data: {
            productId: id,
            delta: nextStock - (previous.stock ?? 0),
            reason: InventoryMovementReason.ADJUSTMENT,
            note: `Корректировка через редактор товара: ${previous.stock ?? 0} → ${nextStock}`,
          },
        });
      }

      await tx.productImage.deleteMany({ where: { productId: id } });

      if (images.length > 0) {
        await tx.productImage.createMany({
          data: images.map((image) => ({ ...image, productId: id })),
        });
      }

      return tx.product.findUniqueOrThrow({
        where: { id },
        select: productSelect(),
      });
    });

    revalidateStorefrontHome();

    return ok(productDto(product));
  } catch (error) {
    if (error instanceof StaleProductError) {
      return fail(409, "PRODUCT_EDIT_CONFLICT", "Товар уже изменён в другой вкладке или на складе. Ваш ввод сохранён в этой форме. Откройте сохранённую версию и сравните изменения перед повторным редактированием.");
    }
    if (isUniqueError(error)) {
      return fail(409, "SLUG_CONFLICT", "Товар с таким адресом страницы уже существует.");
    }

    if (isNotFoundError(error)) {
      return fail(404, "PRODUCT_NOT_FOUND", "Товар не найден.");
    }

    return fail(500, "UPDATE_PRODUCT_FAILED", "Не удалось обновить товар.");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const { id } = await context.params;
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!product) {
      return fail(404, "PRODUCT_NOT_FOUND", "Товар не найден.");
    }

    const [ordersCount, seedSetsCount] = await Promise.all([
      prisma.orderItem.count({ where: { productId: id } }),
      prisma.seedSetRevisionItem.count({ where: { productId: id } }),
    ]);

    if (ordersCount > 0 || seedSetsCount > 0) {
      return productInUseResponse(product.name);
    }

    await prisma.product.delete({ where: { id } });

    revalidateStorefrontHome();

    return ok();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      const { id } = await context.params;
      const product = await prisma.product.findUnique({
        where: { id },
        select: { name: true },
      });

      return productInUseResponse(product?.name ?? "Этот товар");
    }

    return fail(500, "DELETE_PRODUCT_FAILED", "Не удалось удалить товар.");
  }
}
