import { FulfillmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AdminNotificationTone = "neutral" | "success" | "warning" | "danger";

export type AdminNotification = {
  id: string;
  title: string;
  text: string;
  count: number;
  href: string;
  tone: AdminNotificationTone;
};

export type AdminNotificationCounts = {
  newOrders: number;
  missingImages: number;
  hiddenProducts: number;
  lowStockProducts: number;
};

export function buildAdminNotifications({
  newOrders,
  missingImages,
  hiddenProducts,
  lowStockProducts,
}: AdminNotificationCounts): AdminNotification[] {
  return [
    {
      id: "new-orders",
      title: "Новые заказы",
      text: newOrders > 0 ? "Есть заказы для обработки." : "Новых заказов нет.",
      count: newOrders,
      href: "/admin/orders",
      tone: newOrders > 0 ? "warning" : "success",
    },
    {
      id: "missing-images",
      title: "Товары без фото",
      text: missingImages > 0 ? "Карточки требуют изображений." : "Все основные фото заполнены.",
      count: missingImages,
      href: "/admin/catalog?tab=products&image=missing",
      tone: missingImages > 0 ? "warning" : "success",
    },
    {
      id: "hidden-products",
      title: "Скрытые товары",
      text: hiddenProducts > 0 ? "Позиции сняты с витрины." : "Скрытых товаров нет.",
      count: hiddenProducts,
      href: "/admin/catalog?tab=products&published=hidden",
      tone: hiddenProducts > 0 ? "neutral" : "success",
    },
    {
      id: "low-stock",
      title: "Низкий остаток",
      text: lowStockProducts > 0 ? "Нужна проверка складских остатков." : "Критичных остатков нет.",
      count: lowStockProducts,
      href: "/admin/catalog?tab=products&stock=low",
      tone: lowStockProducts > 0 ? "danger" : "success",
    },
  ];
}

export async function getAdminNotificationCounts(): Promise<AdminNotificationCounts> {
  const [newOrders, missingImages, hiddenProducts, lowStockProducts] = await Promise.all([
    prisma.order.count({ where: { fulfillmentStatus: FulfillmentStatus.NEW } }),
    prisma.product.count({
      where: { OR: [{ mainImageUrl: null }, { mainImageUrl: "" }] },
    }),
    prisma.product.count({ where: { isPublished: false } }),
    prisma.product.count({ where: { stock: { lte: 10, not: null } } }),
  ]);

  return {
    newOrders,
    missingImages,
    hiddenProducts,
    lowStockProducts,
  };
}

export async function getAdminNotifications() {
  return buildAdminNotifications(await getAdminNotificationCounts());
}
