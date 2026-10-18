import AdminShell from "../admin-shell";
import { getAdminNotifications } from "../admin-notifications";
import { requireAdminUser } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import CatalogClient from "./catalog-client";

export const dynamic = "force-dynamic";

export default async function AdminCatalogPage() {
  await requireAdminUser();
  const [notifications, productsCount] = await Promise.all([
    getAdminNotifications(),
    prisma.product.count(),
  ]);

  return (
    <AdminShell
      title="Каталог семян"
      subtitle={`${productsCount.toLocaleString("ru-RU")} товаров в базе`}
      primaryAction={{
        href: "/admin/catalog/products/new",
        label: "Новый товар",
        placement: "header",
        testId: "admin-create-product",
      }}
      secondaryActions={[
        {
          href: "/admin/catalog/sets/new",
          label: "Новый набор",
          placement: "header",
        },
      ]}
      search={{
        mode: "catalog",
        placeholder: "Поиск по названию...",
        label: "Поиск по каталогу",
      }}
      notifications={notifications}
    >
      <CatalogClient />
    </AdminShell>
  );
}
