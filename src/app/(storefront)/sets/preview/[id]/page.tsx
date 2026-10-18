import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSeedSetDraftPreview } from "@/app/admin/catalog/sets/seed-set-editor-data";
import SeedSetDetail from "@/features/sets/seed-set-detail";
import { requireAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Предпросмотр набора",
  robots: { index: false, follow: false },
};

export default async function SeedSetPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminUser();
  const seedSet = await getSeedSetDraftPreview(id);

  if (!seedSet) {
    notFound();
  }

  return <SeedSetDetail seedSet={seedSet} preview />;
}
