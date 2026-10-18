import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LightRequirement, SeedDifficulty } from "@prisma/client";
import {
  getCatalogProductBySlug,
  getRelatedCatalogProducts,
} from "@/entities/product/model/catalog-data";
import ProductCard from "@/features/catalog/product-card";
import ProductPurchasePanel from "@/features/product/product-purchase-panel";
import { getSiteUrl } from "@/lib/env";
import { createPageMetadata, stripSiteName } from "@/lib/seo";
import ProductGallery from "./product-gallery";
import ProductScrollReset from "./product-scroll-reset";
import styles from "./product-page.module.css";
import { getCatalogReturnHref } from "@/shared/lib/catalog-return";
import { CatalogReturnLink } from "@/shared/ui/catalog-position";

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"] as const;

const DIFFICULTY_LABELS: Record<SeedDifficulty, string> = {
  BEGINNER: "для новичков",
  INTERMEDIATE: "нужен небольшой опыт",
  EXPERIENCED: "для опытных садоводов",
};

const LIGHT_LABELS: Record<LightRequirement, string> = {
  FULL_SUN: "яркое солнце",
  PARTIAL_SHADE: "солнце или полутень",
  SHADE: "подходит полутень",
};

function formatMonths(months: number[]) {
  return months.map((month) => MONTHS[month - 1]).filter(Boolean).join(", ");
}

function getPlantingHints(plantingTips: string | null) {
  const custom = plantingTips?.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (custom?.length) return custom;

  return [
    "Сверьте сроки посева с климатом вашего региона и рекомендациями на упаковке.",
    "До появления всходов поддерживайте почву равномерно влажной, но не переувлажняйте её.",
    "Подписывайте посевы названием сорта и датой — так проще сравнить результат и спланировать следующий сезон.",
  ];
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalogProductBySlug(slug);

  if (!product) {
    return { title: "Товар не найден", robots: { index: false, follow: false } };
  }

  const savedTitle = product.seoTitle?.trim();
  const savedDescription = product.seoDescription?.trim();
  const title =
    savedTitle &&
    stripSiteName(savedTitle).localeCompare(product.name, "ru", { sensitivity: "base" }) !== 0
      ? savedTitle
      : `${product.name} — купить семена`;
  const fallbackDescription = `${product.shortDescription} Цена ${product.price.toLocaleString("ru-RU")} ₽ за единицу. Самовывоз и доставка по Воронежу.`;
  const description =
    savedDescription && savedDescription !== product.shortDescription.trim()
      ? savedDescription
      : fallbackDescription;

  return createPageMetadata({
    title,
    description,
    path: `/product/${product.slug}`,
    keywords: [
      product.name,
      `${product.name} купить`,
      `семена ${product.category.toLocaleLowerCase("ru-RU")}`,
      ...(product.manufacturer ? [`семена ${product.manufacturer}`] : []),
    ],
    ...(product.gallery.length
      ? {
          images: product.gallery.map((image) => ({
            url: image.url,
            width: image.width,
            height: image.height,
            alt: product.name,
          })),
        }
      : {}),
  });
}

export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { slug } = await params;
  const returnTo = getCatalogReturnHref((await searchParams).returnTo);
  const product = await getCatalogProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedCatalogProducts(product, 3);
  const hints = getPlantingHints(product.plantingTips);
  const sku = product.id.slice(-8).toUpperCase();
  const siteUrl = getSiteUrl();
  const productUrl = `${siteUrl}/product/${product.slug}`;
  const productImages = product.gallery.map((image) =>
    new URL(image.url, `${siteUrl}/`).toString()
  );
  const availability = product.isAvailable
    ? product.inventoryPolicy === "PREORDER" || (product.inventoryPolicy === "TRACKED" && (product.stock ?? 0) === 0)
      ? "https://schema.org/PreOrder"
      : "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${productUrl}#product`,
      url: productUrl,
      name: product.name,
      description: product.shortDescription,
      sku,
      category: product.category,
      image: productImages,
      mainEntityOfPage: productUrl,
      ...(product.manufacturer ? { brand: { "@type": "Brand", name: product.manufacturer } } : {}),
      offers: {
        "@type": "Offer",
        url: productUrl,
        priceCurrency: "RUB",
        price: product.price,
        availability,
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@id": `${siteUrl}/#organization` },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Каталог", item: `${siteUrl}/catalog` },
        { "@type": "ListItem", position: 3, name: product.category, item: `${siteUrl}/catalog/${product.categorySlug}` },
        { "@type": "ListItem", position: 4, name: product.name, item: productUrl },
      ],
    },
  ];

  const specs = [
    ["Категория", product.category],
    ["Фасовка", product.packLabel],
    ["Производитель", product.manufacturer],
    ["Место выращивания", product.growingPlaces.length ? product.growingPlaces.join(", ") : null],
    ["Уровень опыта", product.difficulty ? DIFFICULTY_LABELS[product.difficulty] : null],
    ["Созревание", product.maturityDays ? `${product.maturityDays} дней` : null],
    ["Освещение", product.lightRequirement ? LIGHT_LABELS[product.lightRequirement] : null],
    ["Регионы", product.regionTags.length ? product.regionTags.join(", ") : null],
    ["Код товара", sku],
  ].filter((spec): spec is [string, string] => Boolean(spec[1]));

  const calendarRows = ([
    ["Посев", product.sowMonths],
    ["Пересадка", product.transplantMonths],
    ["Сбор урожая", product.harvestMonths],
  ] satisfies Array<[string, number[]]>).filter((row) => row[1].length > 0);

  return (
    <main className={styles.page}>
      <ProductScrollReset />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} />
      <div className={styles.container}>
        {returnTo ? <CatalogReturnLink href={returnTo} className={styles.returnLink} /> : null}
        <nav className={styles.breadcrumbs} aria-label="Хлебные крошки">
          <Link href="/">Главная</Link><span>/</span><Link href="/catalog">Каталог</Link><span>/</span>
          <Link href={`/catalog/${product.categorySlug}`}>{product.category}</Link><span>/</span><span>{product.name}</span>
        </nav>

        <section className={styles.hero}>
          <div className={styles.identity}>
            <p className={styles.kicker}>{product.manufacturer ?? product.category}</p>
            <h1 className={styles.title}>{product.name}</h1>

            <div className={styles.chips}>
              <span>{product.packLabel}</span>
              {product.difficulty ? <span>{DIFFICULTY_LABELS[product.difficulty]}</span> : null}
              {product.maturityDays ? <span>{product.maturityDays} дней до созревания</span> : null}
            </div>

            <p className={styles.price}>{product.price.toLocaleString("ru-RU")} ₽ <small>за единицу</small></p>
          </div>

          <ProductGallery images={product.gallery} name={product.name} />

          <div className={styles.infoCol}>
            <p className={styles.description}>{product.shortDescription}</p>

            <ProductPurchasePanel
              product={{
                productId: product.id,
                slug: product.slug,
                name: product.name,
                category: product.category,
                price: product.price,
                imageUrl: product.imageUrl,
                stock: product.stock,
                inventoryPolicy: product.inventoryPolicy,
                isAvailable: product.isAvailable,
                packLabel: product.packLabel,
              }}
            />
          </div>
        </section>

        <section className={styles.detailsGrid}>
          <div className={styles.descriptionSection}>
            <p className={styles.sectionNumber}>01</p>
            <h2>О сорте</h2>
            <p>{product.description}</p>
          </div>

          <div className={styles.passportSection}>
            <p className={styles.sectionNumber}>02</p>
            <h2>Паспорт семян</h2>
            <dl className={styles.specGrid}>
              {specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </div>
        </section>

        {calendarRows.length > 0 ? (
          <section className={styles.calendarSection}>
            <div>
              <p className={styles.sectionNumber}>03</p>
              <h2>Календарь выращивания</h2>
              <p>Сроки ориентировочные: учитывайте регион, погоду и способ выращивания.</p>
            </div>
            <div className={styles.calendarRows}>
              {calendarRows.map(([label, months]) => (
                <div key={label}><span>{label}</span><strong>{formatMonths(months)}</strong></div>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.tipsSection}>
          <div>
            <p className={styles.sectionNumber}>{calendarRows.length ? "04" : "03"}</p>
            <h2>Как получить хороший результат</h2>
          </div>
          <ol>{hints.map((hint) => <li key={hint}>{hint}</li>)}</ol>
        </section>

        {related.length > 0 ? (
          <section className={styles.relatedSection}>
            <div className={styles.relatedHeader}>
              <div><p className={styles.kicker}>Ещё в этой теме</p><h2>Похожие семена</h2></div>
              <Link href={`/catalog/${product.categorySlug}`}>Смотреть категорию →</Link>
            </div>
            <div className={styles.relatedGrid}>
              {related.map((item) => <ProductCard key={item.id} product={item} />)}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
