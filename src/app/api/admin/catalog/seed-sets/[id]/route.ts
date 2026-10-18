import { Prisma } from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { revalidateSeedSetStorefront } from "@/lib/storefront-cache";
import { parseJsonBody, seedSetBodySchema } from "@/shared/api/contracts";
import {
  fail,
  isNotFoundError,
  isUniqueError,
  normalizeNonNegativeInt,
  normalizeOptionalString,
  normalizeSeedSetItems,
  normalizeSlug,
  normalizeString,
  ok,
  seedSetDto,
  seedSetSelect,
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
      seedSetBodySchema,
      "Не удалось прочитать черновик набора."
    );
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const body = bodyResult.data;
    const name = normalizeString(body.name);
    const description = normalizeString(body.description);
    const price = normalizeNonNegativeInt(body.price) ?? 0;
    const items = normalizeSeedSetItems(body.items);

    const seedSet = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "SeedSet" WHERE "id" = ${id} FOR UPDATE`
      );

      const existing = await tx.seedSet.findUniqueOrThrow({
        where: { id },
        select: {
          slug: true,
          revisions: { select: { id: true, role: true } },
        },
      });
      const draft = existing.revisions.find((revision) => revision.role === "DRAFT");
      const hasPublishedVersion = existing.revisions.some(
        (revision) => revision.role === "PUBLISHED"
      );

      if (!draft) {
        throw new Error("SEED_SET_DRAFT_MISSING");
      }

      const requestedSlug = normalizeSlug(body.slug);
      const slug = hasPublishedVersion ? existing.slug : requestedSlug || existing.slug;

      await tx.seedSet.update({
        where: { id },
        data: {
          slug,
          draftVersion: { increment: 1 },
        },
      });

      await tx.seedSetRevision.update({
        where: { id: draft.id },
        data: {
          name,
          description,
          shortDescription: normalizeOptionalString(body.shortDescription),
          imageUrl: normalizeOptionalString(body.imageUrl),
          price,
          seoTitle: normalizeOptionalString(body.seoTitle),
          seoDescription: normalizeOptionalString(body.seoDescription),
        },
      });

      await tx.seedSetRevisionItem.deleteMany({ where: { revisionId: draft.id } });

      if (items.length > 0) {
        await tx.seedSetRevisionItem.createMany({
          data: items.map((item) => ({ ...item, revisionId: draft.id })),
        });
      }

      return tx.seedSet.findUniqueOrThrow({
        where: { id },
        select: seedSetSelect(),
      });
    });

    return ok(seedSetDto(seedSet));
  } catch (error) {
    if (isUniqueError(error)) {
      return fail(409, "SLUG_CONFLICT", "Набор с таким адресом страницы уже существует.");
    }

    if (isNotFoundError(error)) {
      return fail(404, "SEED_SET_NOT_FOUND", "Набор не найден.");
    }

    if (error instanceof Error && error.message === "SEED_SET_DRAFT_MISSING") {
      return fail(409, "SEED_SET_DRAFT_MISSING", "У набора отсутствует черновик для редактирования.");
    }

    return fail(500, "UPDATE_SEED_SET_FAILED", "Не удалось сохранить черновик набора.");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const { id } = await context.params;
    const [orderItemsCount, seedSet] = await Promise.all([
      prisma.orderItem.count({ where: { seedSetId: id } }),
      prisma.seedSet.findUnique({ where: { id }, select: { slug: true, isPublished: true } }),
    ]);

    if (!seedSet) {
      return fail(404, "SEED_SET_NOT_FOUND", "Набор не найден.");
    }

    if (orderItemsCount > 0) {
      return fail(
        409,
        "SEED_SET_LINKED_TO_ORDERS",
        "Нельзя удалить набор, который уже есть в заказах. Снимите его с витрины."
      );
    }

    await prisma.seedSet.delete({ where: { id } });

    if (seedSet.isPublished) {
      revalidateSeedSetStorefront(seedSet.slug);
    }

    return ok();
  } catch (error) {
    if (isNotFoundError(error)) {
      return fail(404, "SEED_SET_NOT_FOUND", "Набор не найден.");
    }

    return fail(500, "DELETE_SEED_SET_FAILED", "Не удалось удалить набор.");
  }
}
