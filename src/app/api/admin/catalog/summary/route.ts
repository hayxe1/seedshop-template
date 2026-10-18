import { FulfillmentStatus, PaymentStatus } from "@prisma/client";
import { assertAdminApiSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { ok } from "../_shared";

export const dynamic = "force-dynamic";

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function GET() {
  const admin = await assertAdminApiSession();
  if (admin instanceof Response) {
    return admin;
  }

  const today = startOfToday();

  const [
    newOrdersToday,
    pendingOrders,
    revenue,
    productsCount,
    hiddenProducts,
    lowStockProducts,
    pendingOrderList,
    missingImageProducts,
    lowStockList,
    hiddenProductList,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: today } } }),
    prisma.order.count({ where: { fulfillmentStatus: FulfillmentStatus.NEW } }),
    prisma.order.aggregate({
      where: { paymentStatus: PaymentStatus.SUCCEEDED },
      _sum: { totalPrice: true },
    }),
    prisma.product.count(),
    prisma.product.count({ where: { isPublished: false } }),
    prisma.product.count({ where: { stock: { lte: 10, not: null } } }),
    prisma.order.findMany({
      where: { fulfillmentStatus: FulfillmentStatus.NEW },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        phone: true,
        totalPrice: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.product.findMany({
      where: { OR: [{ mainImageUrl: null }, { mainImageUrl: "" }] },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.product.findMany({
      where: { stock: { lte: 10, not: null } },
      select: {
        id: true,
        name: true,
        slug: true,
        stock: true,
      },
      orderBy: [{ stock: "asc" }, { updatedAt: "desc" }],
      take: 5,
    }),
    prisma.product.findMany({
      where: { isPublished: false },
      select: {
        id: true,
        name: true,
        slug: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  return ok({
    metrics: {
      newOrdersToday,
      pendingOrders,
      revenue: revenue._sum.totalPrice ?? 0,
      productsCount,
      hiddenProducts,
      lowStockProducts,
    },
    attention: {
      pendingOrders: pendingOrderList,
      missingImageProducts,
      lowStockProducts: lowStockList,
      hiddenProducts: hiddenProductList,
    },
  });
}
