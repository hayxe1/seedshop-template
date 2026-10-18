import { Prisma } from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { revalidateStorefrontHome } from "@/lib/storefront-cache";
import { categoryBodySchema, parseJsonBody } from "@/shared/api/contracts";
import {
  categoryDto,
  categorySelect,
  fail,
  isNotFoundError,
  isUniqueError,
  normalizeOptionalString,
  normalizeSlug,
  normalizeString,
  ok,
} from "../../_shared";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const { id } = await context.params;
    const bodyResult = await parseJsonBody(
      request,
      categoryBodySchema,
      "Заполните название и адрес страницы категории."
    );
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const body = bodyResult.data;
    const name = normalizeString(body.name);
    const slug = normalizeSlug(body.slug);

    if (!name || !slug) {
      return fail(400, "VALIDATION_ERROR", "Заполните название и адрес страницы категории.");
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        name,
        slug,
        description: normalizeOptionalString(body.description),
        seoTitle: normalizeOptionalString(body.seoTitle),
        seoDescription: normalizeOptionalString(body.seoDescription),
      },
      select: categorySelect(),
    });

    revalidateStorefrontHome();

    return ok(categoryDto(category));
  } catch (error) {
    if (isUniqueError(error)) {
      return fail(409, "SLUG_CONFLICT", "Категория с таким адресом страницы уже существует.");
    }

    if (isNotFoundError(error)) {
      return fail(404, "CATEGORY_NOT_FOUND", "Категория не найдена.");
    }

    return fail(500, "UPDATE_CATEGORY_FAILED", "Не удалось обновить категорию.");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const { id } = await context.params;
    const productsCount = await prisma.product.count({ where: { categoryId: id } });

    if (productsCount > 0) {
      return fail(
        409,
        "CATEGORY_IN_USE",
        "Категорию нельзя удалить, пока в ней есть товары."
      );
    }

    await prisma.category.delete({ where: { id } });

    revalidateStorefrontHome();

    return ok();
  } catch (error) {
    if (isNotFoundError(error)) {
      return fail(404, "CATEGORY_NOT_FOUND", "Категория не найдена.");
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return fail(
        409,
        "CATEGORY_IN_USE",
        "Категорию нельзя удалить, пока в ней есть товары."
      );
    }

    return fail(500, "DELETE_CATEGORY_FAILED", "Не удалось удалить категорию.");
  }
}
