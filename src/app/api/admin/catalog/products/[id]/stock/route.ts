import {
  InventoryMovementReason,
  InventoryPolicy,
  Prisma,
} from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { revalidateStorefrontHome } from "@/lib/storefront-cache";
import {
  adjustStockBodySchema,
  fail,
  ok,
  parseJsonBody,
} from "@/shared/api/contracts";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  const bodyResult = await parseJsonBody(
    request,
    adjustStockBodySchema,
    "Укажите корректный остаток."
  );
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  try {
    const { id } = await context.params;
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`
        );
        const product = await tx.product.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            stock: true,
            inventoryPolicy: true,
          },
        });
        if (!product) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        if (product.inventoryPolicy !== InventoryPolicy.TRACKED) {
          throw new Error("STOCK_NOT_TRACKED");
        }

        const previousStock = product.stock ?? 0;
        const delta = bodyResult.data.stock - previousStock;
        const updated = await tx.product.update({
          where: { id: product.id },
          data: { stock: bodyResult.data.stock },
          select: { id: true, stock: true, updatedAt: true },
        });

        if (delta !== 0) {
          await tx.inventoryMovement.create({
            data: {
              productId: product.id,
              delta,
              reason: InventoryMovementReason.ADJUSTMENT,
              note:
                bodyResult.data.note ||
                `Ручная корректировка в админке: ${previousStock} → ${bodyResult.data.stock}`,
            },
          });
        }

        return { ...updated, delta };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      }
    );

    revalidateStorefrontHome();

    return ok({
      productId: result.id,
      stock: result.stock ?? 0,
      delta: result.delta,
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return fail(404, "PRODUCT_NOT_FOUND", "Товар не найден.");
    }
    if (error instanceof Error && error.message === "STOCK_NOT_TRACKED") {
      return fail(
        409,
        "STOCK_NOT_TRACKED",
        "Для этого товара количественный остаток не учитывается."
      );
    }

    return fail(500, "UPDATE_STOCK_FAILED", "Не удалось обновить остаток.");
  }
}
