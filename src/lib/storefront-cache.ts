import { revalidatePath } from "next/cache";

export function revalidateStorefrontHome() {
  revalidatePath("/");
  revalidatePath("/sets");
}

export function revalidateSeedSetStorefront(slug: string) {
  revalidatePath("/");
  revalidatePath("/sets");
  revalidatePath(`/sets/${slug}`);
  revalidatePath("/sitemap.xml");
}
