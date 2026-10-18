import { notFound } from "next/navigation";
import AdminShell from "../../../admin-shell";
import { getAdminNotifications } from "../../../admin-notifications";
import { requireAdminUser } from "@/lib/admin-auth";
import ProductEditorPage from "../product-editor-client";
import {
  getProductEditorAssets,
  getProductEditorCategories,
  getProductEditorProduct,
} from "../product-editor-data";

export const dynamic = "force-dynamic";

export default async function AdminEditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminUser();
  const [notifications, categories, assets, product] = await Promise.all([
    getAdminNotifications(),
    getProductEditorCategories(),
    getProductEditorAssets(),
    getProductEditorProduct(id),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <AdminShell title="Редактирование товара" notifications={notifications} hidePageHeader>
      <ProductEditorPage mode="edit" product={product} categories={categories} assets={assets} />
    </AdminShell>
  );
}
