import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  DEPRECATED_VEGETABLES_CATEGORY_SLUG,
  getCatalogCategoryBySlug,
  queryCatalogProducts,
} from "@/entities/product/model/catalog-data";
import ProductCard from "@/features/catalog/product-card";
import { getSiteUrl } from "@/lib/env";
import { createPageMetadata, stripSiteName } from "@/lib/seo";
import styles from "../catalog.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: categorySlug } = await params;
  const category = await getCatalogCategoryBySlug(categorySlug);

  if (!category) {
    return {
      title: "Раздел не найден",
      robots: { index: false, follow: false },
    };
  }

  const savedTitle = category.seoTitle?.trim();
  const savedDescription = category.seoDescription?.trim();
  const title =
    savedTitle &&
    stripSiteName(savedTitle).localeCompare(category.name, "ru", { sensitivity: "base" }) !== 0
      ? savedTitle
      : `${category.name} — купить семена`;
  const description =
    savedDescription && savedDescription !== category.description?.trim()
      ? savedDescription
      : `Купите семена из раздела «${category.name}» в интернет-магазине «Магазин семян». Актуальные цены и наличие, характеристики сортов и помощь с выбором.`;

  return createPageMetadata({
    title,
    description,
    path: `/catalog/${category.slug}`,
    keywords: [
      `${category.name} семена`,
      `${category.name} купить семена`,
      `семена ${category.name.toLocaleLowerCase("ru-RU")}`,
    ],
  });
}

export default async function CatalogCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: categorySlug } = await params;

  if (categorySlug === DEPRECATED_VEGETABLES_CATEGORY_SLUG) {
    redirect("/catalog");
  }

  const category = await getCatalogCategoryBySlug(categorySlug);

  if (!category) {
    notFound();
  }

  const { items, total } = await queryCatalogProducts({ category: category.slug, pageSize: 48 });
  const siteUrl = getSiteUrl();
  const categoryUrl = `${siteUrl}/catalog/${category.slug}`;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${categoryUrl}#collection`,
      url: categoryUrl,
      name: category.name,
      description:
        category.description ??
        `Семена из раздела «${category.name}» в интернет-магазине «Магазин семян».`,
      inLanguage: "ru-RU",
      mainEntity: { "@id": `${categoryUrl}#products` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Каталог", item: `${siteUrl}/catalog` },
        { "@type": "ListItem", position: 3, name: category.name, item: categoryUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${categoryUrl}#products`,
      name: `Семена: ${category.name}`,
      numberOfItems: total,
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${siteUrl}/product/${item.slug}`,
        item: {
          "@type": "Product",
          name: item.name,
          description: item.shortDescription,
          image: new URL(item.imageUrl, `${siteUrl}/`).toString(),
          offers: {
            "@type": "Offer",
            price: item.price,
            priceCurrency: "RUB",
            availability: item.isAvailable
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            url: `${siteUrl}/product/${item.slug}`,
          },
        },
      })),
    },
  ];

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Раздел каталога</p>
            <h1 className={styles.title}>{category.name}</h1>
            <p className={styles.subtitle}>
              {category.description ?? `Подобрано ${total} товаров в этой категории.`}
            </p>
          </div>
          <div className={styles.headerLinks}>
            <Link href="/catalog" className={styles.backLink}>
              Весь каталог
            </Link>
          </div>
        </header>

        {items.length === 0 ? (
          <section className={styles.emptyState}>
            <h2>В этой категории пока нет товаров</h2>
            <p>Попробуйте открыть весь каталог или выбрать другой раздел.</p>
            <Link href="/catalog" className={styles.primaryBtn}>
              Открыть каталог
            </Link>
          </section>
        ) : (
          <section className={styles.grid}>
            {items.map((item, index) => (
              <ProductCard key={item.id} product={item} loading={index < 4 ? "eager" : "lazy"} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
