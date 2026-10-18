import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { revalidateStorefrontHome } from "@/lib/storefront-cache";
import { categoryBodySchema, parseJsonBody } from "@/shared/api/contracts";
import {
  categoryDto,
  categorySelect,
  fail,
  isUniqueError,
  normalizeOptionalString,
  normalizeSlug,
  normalizeString,
  ok,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  const categories = await prisma.category.findMany({
    select: categorySelect(),
    orderBy: { name: "asc" },
  });

  return ok(categories.map(categoryDto));
}

export async function POST(request: Request) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
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

    const category = await prisma.category.create({
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

    return ok(categoryDto(category), { status: 201 });
  } catch (error) {
    if (isUniqueError(error)) {
      return fail(409, "SLUG_CONFLICT", "Категория с таким адресом страницы уже существует.");
    }

    return fail(500, "CREATE_CATEGORY_FAILED", "Не удалось создать категорию.");
  }
}
