import { notFound } from "next/navigation";
import AdminShell from "../../../admin-shell";
import { getAdminNotifications } from "../../../admin-notifications";
import { requireAdminUser } from "@/lib/admin-auth";
import SeedSetEditorPage from "../seed-set-editor-client";
import {
  getSeedSetEditorAssets,
  getSeedSetEditorProducts,
  getSeedSetEditorSeedSet,
} from "../seed-set-editor-data";

export const dynamic = "force-dynamic";

export default async function AdminEditSeedSetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminUser();
  const [notifications, products, assets, seedSet] = await Promise.all([
    getAdminNotifications(),
    getSeedSetEditorProducts(),
    getSeedSetEditorAssets(),
    getSeedSetEditorSeedSet(id),
  ]);

  if (!seedSet) {
    notFound();
  }

  return (
    <AdminShell title="Редактирование набора" notifications={notifications} hidePageHeader>
      <SeedSetEditorPage mode="edit" seedSet={seedSet} products={products} assets={assets} />
    </AdminShell>
  );
}
