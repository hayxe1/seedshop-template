import type { FulfillmentStatus } from "@/shared/api/contracts";

export const adminOrderStatusLabels: Record<FulfillmentStatus, string> = {
  NEW: "Новый",
  PROCESSING: "В обработке",
  PACKED: "Собран",
  SHIPPED: "Отправлен",
  DELIVERED: "Доставлен",
  CANCELLED: "Отменён",
};

export function getAdminOrderStatusLabel(status: FulfillmentStatus) {
  return adminOrderStatusLabels[status];
}
