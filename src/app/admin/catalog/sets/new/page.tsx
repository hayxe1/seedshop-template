import AdminShell from "../../../admin-shell";
import { getAdminNotifications } from "../../../admin-notifications";
import { requireAdminUser } from "@/lib/admin-auth";
import SeedSetEditorPage from "../seed-set-editor-client";
import {
  getSeedSetEditorAssets,
  getSeedSetEditorProducts,
} from "../seed-set-editor-data";

export const dynamic = "force-dynamic";

export default async function AdminNewSeedSetPage() {
  await requireAdminUser();
  const [notifications, products, assets] = await Promise.all([
    getAdminNotifications(),
    getSeedSetEditorProducts(),
    getSeedSetEditorAssets(),
  ]);

  return (
    <AdminShell title="Создание набора" notifications={notifications} hidePageHeader>
      <SeedSetEditorPage mode="create" seedSet={null} products={products} assets={assets} />
    </AdminShell>
  );
}
