import type { Prisma } from "@prisma/client";
import { getCatalogSearchTermGroups } from "./catalog-search";

// One bounded predicate for suggestions and full results. Codes are exact suffixes,
// never stemmed; if suffixes collide, every matching published product is returned.
export function getProductSearchWhere(rawQuery: string): Prisma.ProductWhereInput {
  const query = rawQuery.trim().slice(0, 120);
  const groups = getCatalogSearchTermGroups(query);
  const text: Prisma.ProductWhereInput = groups.length ? {
    AND: groups.map(terms => ({ OR: terms.flatMap(term => [
      { name: { contains: term, mode: "insensitive" as const } },
      { shortDescription: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
      { manufacturer: { contains: term, mode: "insensitive" as const } },
      { category: { name: { contains: term, mode: "insensitive" as const } } },
    ]) })),
  } : {};
  return /^[a-z0-9]{8}$/i.test(query)
    ? { OR: [{ id: { endsWith: query, mode: "insensitive" } }, text] }
    : text;
}
