import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { revalidateSeedSetStorefront } from "@/lib/storefront-cache";
import {
  fail,
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
    const current = await prisma.seedSet.findUniqueOrThrow({
      where: { id },
      select: { slug: true },
    });

    const seedSet = await prisma.seedSet.update({
      where: { id },
      data: { isPublished: false },
      select: seedSetSelect(),
    });

    revalidateSeedSetStorefront(current.slug);
    return ok(seedSetDto(seedSet));
  } catch (error) {
    if (isNotFoundError(error)) {
      return fail(404, "SEED_SET_NOT_FOUND", "Набор не найден.");
    }

    return fail(500, "UNPUBLISH_SEED_SET_FAILED", "Не удалось снять набор с публикации.");
  }
}
