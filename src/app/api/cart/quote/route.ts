import { SeedSetRevisionRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cartQuoteBodySchema, fail, ok, parseJsonBody } from "@/shared/api/contracts";

// Read-only quote. Never returns hidden product data or creates a reservation.
export async function POST(request: Request) {
  const body = await parseJsonBody(request, cartQuoteBodySchema);
  if (!body.ok) return body.response;
  try {
    const [products, sets] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: body.data.items.filter(item => item.kind === "product").map(item => item.id) }, isPublished: true },
        select: { id: true, name: true, slug: true, price: true, stock: true, inventoryPolicy: true },
      }),
      prisma.seedSet.findMany({
        where: { id: { in: body.data.items.filter(item => item.kind === "seedSet").map(item => item.id) }, isPublished: true },
        select: { id: true, slug: true, revisions: {
          where: { role: SeedSetRevisionRole.PUBLISHED }, take: 1,
          select: { name: true, price: true, items: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { product: { select: { id: true, slug: true, name: true, price: true, stock: true, inventoryPolicy: true, isPublished: true } } },
          } },
        } },
      }),
    ]);
    const productById = new Map(products.map(product => [product.id, product]));
    const setById = new Map(sets.map(set => [set.id, set]));
    return ok(body.data.items.map(item => {
      const itemKey = `${item.kind}:${item.id}`;
      if (item.kind === "product") {
        const product = productById.get(item.id);
        return { itemKey, data: product ? {
          name: product.name, slug: product.slug, price: product.price,
          stock: product.inventoryPolicy === "TRACKED" ? product.stock ?? 0 : null,
          inventoryPolicy: product.inventoryPolicy,
        } : null };
      }
      const set = setById.get(item.id);
      const revision = set?.revisions[0];
      if (!revision || !revision.items.length || revision.items.some(row => !row.product.isPublished)) return { itemKey, data: null };
      return { itemKey, data: {
        name: revision.name, slug: set!.slug, price: revision.price, stock: null,
        items: revision.items.map(({ product }) => ({
          productId: product.id, name: product.name, slug: product.slug, price: product.price,
          stock: product.inventoryPolicy === "TRACKED" ? product.stock ?? 0 : null,
          inventoryPolicy: product.inventoryPolicy,
        })),
      } };
    }), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail(503, "CART_CHECK_FAILED", "Не удалось проверить цены и наличие. Повторите проверку перед оформлением.");
  }
}
