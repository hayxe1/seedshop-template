import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminNotifications } from "../admin-notifications";
import OrdersClient from "./orders-client";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  await requireAdminUser();
  const notifications = await getAdminNotifications();

  return <OrdersClient notifications={notifications} />;
}
