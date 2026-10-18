import AdminShell from "../../../admin-shell";
import { getAdminNotifications } from "../../../admin-notifications";
import { requireAdminUser } from "@/lib/admin-auth";
import ProductEditorPage from "../product-editor-client";
import {
  getProductEditorAssets,
  getProductEditorCategories,
} from "../product-editor-data";

export const dynamic = "force-dynamic";

export default async function AdminNewProductPage() {
  await requireAdminUser();
  const [notifications, categories, assets] = await Promise.all([
    getAdminNotifications(),
    getProductEditorCategories(),
    getProductEditorAssets(),
  ]);

  return (
    <AdminShell title="Создание товара" notifications={notifications} hidePageHeader>
      <ProductEditorPage mode="create" product={null} categories={categories} assets={assets} />
    </AdminShell>
  );
}
