import {
  getCatalogCategoryList,
  getCatalogPreviewProducts,
  getFeaturedSeedSets,
  getPopularTodayProducts,
} from "@/entities/product/model/catalog-data";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/env";
import { createPageMetadata, SITE_NAME } from "@/lib/seo";
import AdvantagesSection from "@/features/home/advantages-section";
import CatalogPreviewSection from "@/features/home/catalog-preview-section";
import CategorySection from "@/features/home/category-section";
import {
  advantages,
  faqPreview,
  fallbackQuickCategories,
  quickCategoryIcons,
  type CategoryCard,
} from "@/features/home/content";
import FaqPreviewSection from "@/features/home/faq-preview-section";
import HeroSection from "@/features/home/hero-section";
import PopularProductsSection from "@/features/home/popular-products-section";
import NewbieSection from "@/features/home/newbie-section";
import styles from "@/features/home/home.module.css";

const HOME_CATALOG_PREVIEW_LIMIT = 16;
const starterChecklist = [
  "Определите, где будете выращивать: в открытом грунте, теплице или на балконе.",
  "Начните с трёх–пяти культур и проверьте сроки посева для своего региона.",
  "Добавьте сорта в готовый или собственный набор — наличие проверим перед оплатой.",
];

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "Купить семена для дачи и огорода",
  description:
    "Интернет-магазин семян овощей, зелени и цветов для дачи, теплицы и балкона. Удобный подбор, готовые наборы, заказ без регистрации и доставка по Воронежу.",
  path: "/",
  keywords: [
    "купить семена",
    "купить семена онлайн",
    "заказать семена",
    "интернет-магазин семян",
    "семена овощей",
    "семена цветов",
    "семена зелени",
    "семена для дачи",
    "семена для теплицы",
    "семена Воронеж",
  ],
});

export default async function Home() {
  const siteUrl = getSiteUrl();
  const [catalogPreviewProducts, categories, popularTodayProducts, featuredSeedSets] = await Promise.all([
    getCatalogPreviewProducts(HOME_CATALOG_PREVIEW_LIMIT),
    getCatalogCategoryList(),
    getPopularTodayProducts(8),
    getFeaturedSeedSets(3),
  ]);

  const quickCategories: CategoryCard[] = categories.slice(0, 6).map((category) => ({
    name: category.name,
    slug: category.slug,
    href: `/catalog/${category.slug}`,
    iconSrc: quickCategoryIcons[category.slug] ?? "/category-icons/tomaty-reference.png",
  }));

  const categoryCards = quickCategories.length > 0 ? quickCategories : fallbackQuickCategories;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "OnlineStore",
      "@id": `${siteUrl}/#organization`,
      name: SITE_NAME,
      url: siteUrl,
      logo: `${siteUrl}/icon.svg`,
      image: `${siteUrl}/home/hero-garden.webp`,
      currenciesAccepted: "RUB",
      paymentAccepted: "Банковские карты, ЮMoney",
      areaServed: {
        "@type": "City",
        name: "Воронеж",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: SITE_NAME,
      inLanguage: "ru-RU",
      publisher: { "@id": `${siteUrl}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/catalog?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqPreview.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ];

  return (
    <main className={styles.main}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />
      <HeroSection />
      <PopularProductsSection popularProducts={popularTodayProducts} />
      <CategorySection categoryCards={categoryCards} />
      <NewbieSection starterChecklist={starterChecklist} featuredSeedSets={featuredSeedSets} />
      <CatalogPreviewSection products={catalogPreviewProducts} />
      <AdvantagesSection advantages={advantages} />
      <FaqPreviewSection items={faqPreview} />
    </main>
  );
}
