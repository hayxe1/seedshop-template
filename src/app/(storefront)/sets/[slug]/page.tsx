import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalogSeedSetBySlug } from "@/entities/product/model/catalog-data";
import SeedSetDetail from "@/features/sets/seed-set-detail";
import { getSiteUrl } from "@/lib/env";
import { createPageMetadata, stripSiteName } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const seedSet = await getCatalogSeedSetBySlug(slug);
  if (!seedSet) {
    return {
      title: "Набор не найден",
      robots: { index: false, follow: false },
    };
  }

  const baseDescription = seedSet.shortDescription ?? seedSet.description;
  const savedTitle = seedSet.seoTitle?.trim();
  const savedDescription = seedSet.seoDescription?.trim();
  const title =
    savedTitle &&
    stripSiteName(savedTitle).localeCompare(seedSet.name, "ru", { sensitivity: "base" }) !== 0
      ? savedTitle
      : `${seedSet.name} — купить набор семян`;
  const description =
    savedDescription && savedDescription !== baseDescription.trim()
      ? savedDescription
      : `${baseDescription} Готовый состав по выгодной цене, заказ без регистрации и доставка по Воронежу.`;

  return createPageMetadata({
    title,
    description,
    path: `/sets/${seedSet.slug}`,
    keywords: [seedSet.name, `${seedSet.name} купить`, "купить набор семян"],
    ...(seedSet.imageUrl
      ? { images: [{ url: seedSet.imageUrl, alt: seedSet.name }] }
      : {}),
  });
}

export default async function SeedSetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const seedSet = await getCatalogSeedSetBySlug(slug);
  if (!seedSet) notFound();

  const siteUrl = getSiteUrl();
  const seedSetUrl = `${siteUrl}/sets/${seedSet.slug}`;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${seedSetUrl}#product`,
      url: seedSetUrl,
      name: seedSet.name,
      description: seedSet.shortDescription ?? seedSet.description,
      category: "Наборы семян",
      ...(seedSet.imageUrl
        ? { image: new URL(seedSet.imageUrl, `${siteUrl}/`).toString() }
        : {}),
      isRelatedTo: seedSet.items.map((item) => ({
        "@type": "Product",
        name: item.name,
        url: `${siteUrl}/product/${item.slug}`,
      })),
      offers: {
        "@type": "Offer",
        url: seedSetUrl,
        priceCurrency: "RUB",
        price: seedSet.price,
        availability: seedSet.isAvailable
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@id": `${siteUrl}/#organization` },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Наборы семян", item: `${siteUrl}/sets` },
        { "@type": "ListItem", position: 3, name: seedSet.name, item: seedSetUrl },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />
      <SeedSetDetail seedSet={seedSet} />
    </>
  );
}
