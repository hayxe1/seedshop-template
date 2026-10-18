import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, seedSetBodySchema } from "@/shared/api/contracts";
import {
  fail,
  isUniqueError,
  normalizeNonNegativeInt,
  normalizeOptionalString,
  normalizeSeedSetItems,
  normalizeSlug,
  normalizeString,
  ok,
  seedSetDto,
  seedSetSelect,
} from "../_shared";

export const dynamic = "force-dynamic";

const transliteration: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slugifyName(value: string) {
  const normalized = value
    .toLowerCase()
    .split("")
    .map((symbol) => transliteration[symbol] ?? symbol)
    .join("");

  return (
    normalized
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || `nabor-${Date.now().toString(36)}`
  );
}

async function createUniqueSeedSetSlug(name: string) {
  const baseSlug = slugifyName(name || "Новый набор");
  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.seedSet.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function GET() {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  const seedSets = await prisma.seedSet.findMany({
    select: seedSetSelect(),
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return ok(seedSets.map(seedSetDto));
}

export async function POST(request: Request) {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const bodyResult = await parseJsonBody(
      request,
      seedSetBodySchema,
      "Не удалось прочитать черновик набора."
    );
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const body = bodyResult.data;
    const name = normalizeString(body.name) || "Новый набор";
    const requestedSlug = normalizeSlug(body.slug);
    const slug = requestedSlug || (await createUniqueSeedSetSlug(name));
    const description = normalizeString(body.description);
    const price = normalizeNonNegativeInt(body.price) ?? 0;
    const items = normalizeSeedSetItems(body.items);

    const seedSet = await prisma.$transaction(async (tx) => {
      const created = await tx.seedSet.create({
        data: {
          slug,
          isPublished: false,
          draftVersion: 1,
          publishedVersion: 0,
          revisions: {
            create: {
              role: "DRAFT",
              name,
              description,
              shortDescription: normalizeOptionalString(body.shortDescription),
              imageUrl: normalizeOptionalString(body.imageUrl),
              price,
              seoTitle: normalizeOptionalString(body.seoTitle),
              seoDescription: normalizeOptionalString(body.seoDescription),
              ...(items.length > 0
                ? { items: { createMany: { data: items } } }
                : {}),
            },
          },
        },
        select: { id: true },
      });

      return tx.seedSet.findUniqueOrThrow({
        where: { id: created.id },
        select: seedSetSelect(),
      });
    });

    return ok(seedSetDto(seedSet), { status: 201 });
  } catch (error) {
    if (isUniqueError(error)) {
      return fail(409, "SLUG_CONFLICT", "Набор с таким адресом страницы уже существует.");
    }

    return fail(500, "CREATE_SEED_SET_FAILED", "Не удалось создать черновик набора.");
  }
}
