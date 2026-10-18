import type { CartItemRecord } from "@/shared/api/contracts";

export function isCartItemPreorder(item: CartItemRecord) {
  if (item.kind === "seedSet") {
    return item.items?.some((component) =>
      component.inventoryPolicy === "PREORDER" ||
      (component.stock != null && item.quantity > component.stock)
    ) ?? false;
  }
  return item.inventoryPolicy === "PREORDER" || (item.stock != null && item.quantity > item.stock);
}

export const PREORDER_NOTICE = "Часть заказа — под заказ. Менеджер согласует с вами срок поставки до оплаты.";
