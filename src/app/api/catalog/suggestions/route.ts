import { prisma } from "@/lib/prisma";
import { getProductSearchWhere } from "@/entities/product/model/catalog-search-where";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (query.length < 2) return Response.json({ products: [], categories: [] });

  const rateLimit = await consumeRateLimit({
    key: rateLimitKey("catalog-suggestions", getClientIp(request)),
    limit: 60,
    windowMs: 60_000,
  });
  if (rateLimit.limited) return rateLimitResponse(rateLimit);

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: {
        isPublished: true,
        ...getProductSearchWhere(query),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        price: true,
        mainImageUrl: true,
        category: { select: { name: true } },
      },
      orderBy: [{ isPopularToday: "desc" }, { updatedAt: "desc" }],
      take: 6,
    }),
    prisma.category.findMany({
      where: {
        name: { contains: query, mode: "insensitive" },
        products: { some: { isPublished: true } },
      },
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
      take: 3,
    }),
  ]);

  return Response.json(
    {
      products: products.map((product) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        imageUrl: product.mainImageUrl,
        category: product.category.name,
      })),
      categories,
    },
    { headers: { "Cache-Control": "private, max-age=30" } }
  );
}
