import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  await requireAdminUser();
  redirect("/admin/catalog?tab=products");
}
