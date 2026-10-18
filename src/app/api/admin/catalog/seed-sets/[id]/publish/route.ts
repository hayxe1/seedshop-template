import { Prisma } from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { revalidateSeedSetStorefront } from "@/lib/storefront-cache";
import {
  fail,
  getSeedSetReadiness,
  isNotFoundError,
  ok,
  seedSetDto,
  seedSetSelect,
} from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const { id } = await context.params;
    const seedSet = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "SeedSet" WHERE "id" = ${id} FOR UPDATE`
      );

      const current = await tx.seedSet.findUniqueOrThrow({
        where: { id },
        select: seedSetSelect(),
      });
      const draft = current.revisions.find((revision) => revision.role === "DRAFT");
      const published = current.revisions.find((revision) => revision.role === "PUBLISHED");
      const readiness = getSeedSetReadiness(current);
      const missing = readiness.filter((item) => !item.passed);

      if (!draft) {
        throw new Error("SEED_SET_DRAFT_MISSING");
      }

      if (missing.length > 0) {
        throw new Error(`SEED_SET_NOT_READY:${missing.map((item) => item.label).join("; ")}`);
      }

      if (published) {
        await tx.seedSetRevision.delete({ where: { id: published.id } });
      }

      await tx.seedSetRevision.update({
        where: { id: draft.id },
        data: { role: "PUBLISHED" },
      });

      await tx.seedSetRevision.create({
        data: {
          seedSetId: id,
          role: "DRAFT",
          name: draft.name,
          description: draft.description,
          shortDescription: draft.shortDescription,
          imageUrl: draft.imageUrl,
          price: draft.price,
          seoTitle: draft.seoTitle,
          seoDescription: draft.seoDescription,
          ...(draft.items.length > 0
            ? {
                items: {
                  createMany: {
                    data: draft.items.map((item) => ({
                      productId: item.productId,
                      position: item.position,
                    })),
                  },
                },
              }
            : {}),
        },
      });

      await tx.seedSet.update({
        where: { id },
        data: {
          isPublished: true,
          publishedAt: new Date(),
          publishedVersion: current.draftVersion,
        },
      });

      return tx.seedSet.findUniqueOrThrow({
        where: { id },
        select: seedSetSelect(),
      });
    });

    revalidateSeedSetStorefront(seedSet.slug);
    return ok(seedSetDto(seedSet));
  } catch (error) {
    if (isNotFoundError(error)) {
      return fail(404, "SEED_SET_NOT_FOUND", "Набор не найден.");
    }

    if (error instanceof Error && error.message === "SEED_SET_DRAFT_MISSING") {
      return fail(409, "SEED_SET_DRAFT_MISSING", "У набора отсутствует черновик для публикации.");
    }

    if (error instanceof Error && error.message.startsWith("SEED_SET_NOT_READY:")) {
      const details = error.message.slice("SEED_SET_NOT_READY:".length);
      return fail(409, "SEED_SET_NOT_READY", `Проверьте набор перед публикацией: ${details}.`);
    }

    return fail(500, "PUBLISH_SEED_SET_FAILED", "Не удалось опубликовать набор.");
  }
}
