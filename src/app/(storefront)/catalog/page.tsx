import Link from "next/link";
import type { Metadata } from "next";
import { SeedDifficulty } from "@prisma/client";
import {
  DEPRECATED_VEGETABLES_CATEGORY_SLUG,
  getCatalogCategoryList,
  getCatalogFilterOptions,
  queryCatalogProducts,
  type CatalogSort,
} from "@/entities/product/model/catalog-data";
import ProductCard from "@/features/catalog/product-card";
import { CatalogPositionRestorer } from "@/shared/ui/catalog-position";
import { getSiteUrl } from "@/lib/env";
import { createPageMetadata } from "@/lib/seo";
import CatalogSortControl from "./catalog-sort-control";
import styles from "./catalog.module.css";

type CatalogSearchParams = {
  q?: string | string[];
  category?: string | string[];
  manufacturer?: string | string[];
  priceFrom?: string | string[];
  priceTo?: string | string[];
  available?: string | string[];
  place?: string | string[];
  sowMonth?: string | string[];
  difficulty?: string | string[];
  sort?: string | string[];
  page?: string | string[];
};

type ParsedCatalogParams = {
  q: string;
  categories: string[];
  manufacturers: string[];
  priceFrom: number | undefined;
  priceTo: number | undefined;
  availableOnly: boolean;
  growingPlace: string;
  sowMonth: number | undefined;
  difficulty: SeedDifficulty | undefined;
  sort: CatalogSort;
  page: number;
};

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;
const MONTHS_PREPOSITIONAL = [
  "январе",
  "феврале",
  "марте",
  "апреле",
  "мае",
  "июне",
  "июле",
  "августе",
  "сентябре",
  "октябре",
  "ноябре",
  "декабре",
] as const;

const DIFFICULTY_LABELS: Record<SeedDifficulty, string> = {
  BEGINNER: "Подойдёт новичку",
  INTERMEDIATE: "Нужен небольшой опыт",
  EXPERIENCED: "Для опытных садоводов",
};

const SORT_LABELS: Record<CatalogSort, string> = {
  popular: "Сначала популярные",
  newest: "Сначала новинки",
  "price-asc": "Сначала дешевле",
  "price-desc": "Сначала дороже",
  name: "По названию",
};

const SORT_OPTIONS = Object.entries(SORT_LABELS).map(([value, label]) => ({
  value: value as CatalogSort,
  label,
}));
const VALID_SORTS = new Set<CatalogSort>(Object.keys(SORT_LABELS) as CatalogSort[]);
const VALID_DIFFICULTIES = new Set<SeedDifficulty>(Object.values(SeedDifficulty));

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}): Promise<Metadata> {
  const params = parseParams(await searchParams);
  const hasFilters = hasCatalogFilters(params);
  const path = params.page > 1 ? `/catalog?page=${params.page}` : "/catalog";

  return createPageMetadata({
    title:
      params.page > 1
        ? `Каталог семян — страница ${params.page}`
        : "Купить семена овощей и цветов",
    description:
      params.page > 1
        ? `Страница ${params.page} каталога семян овощей, зелени и цветов. Актуальные цены и наличие, удобный выбор для дачи, теплицы и балкона.`
        : "Купите семена овощей, зелени и цветов для дачи, теплицы или балкона. Фильтры по культуре, сроку посева и условиям выращивания, актуальные цены и наличие.",
    path,
    canonical: hasFilters ? false : path,
    keywords: [
      "купить семена",
      "каталог семян",
      "семена овощей купить",
      "семена цветов купить",
      "семена зелени купить",
    ],
    ...(hasFilters ? { robots: { index: false, follow: true } } : {}),
  });
}

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function all(value?: string | string[]) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(
    new Set(values.map((item) => item.trim().slice(0, 120)).filter((item) => item.length > 0))
  );
}

function optionalNumber(value: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!value.trim()) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function parseParams(params: CatalogSearchParams): ParsedCatalogParams {
  const requestedCategories = all(params.category)
    .filter((category) => category !== DEPRECATED_VEGETABLES_CATEGORY_SLUG)
    .slice(0, 24);
  const requestedManufacturers = all(params.manufacturer).slice(0, 24);
  const difficultyValue = first(params.difficulty) as SeedDifficulty;
  const sortValue = first(params.sort) as CatalogSort;
  const firstPrice = optionalNumber(first(params.priceFrom));
  const secondPrice = optionalNumber(first(params.priceTo));
  const pricesAreReversed = firstPrice !== undefined && secondPrice !== undefined && firstPrice > secondPrice;

  return {
    q: first(params.q).trim().slice(0, 120),
    categories: requestedCategories,
    manufacturers: requestedManufacturers,
    priceFrom: pricesAreReversed ? secondPrice : firstPrice,
    priceTo: pricesAreReversed ? firstPrice : secondPrice,
    availableOnly: first(params.available) === "1",
    growingPlace: first(params.place).trim(),
    sowMonth: optionalNumber(first(params.sowMonth), 1, 12),
    difficulty: VALID_DIFFICULTIES.has(difficultyValue) ? difficultyValue : undefined,
    sort: VALID_SORTS.has(sortValue) ? sortValue : "popular",
    page: optionalNumber(first(params.page), 1) ?? 1,
  };
}

function hasCatalogFilters(params: ParsedCatalogParams) {
  return Boolean(
    params.q ||
      params.categories.length ||
      params.manufacturers.length ||
      params.priceFrom !== undefined ||
      params.priceTo !== undefined ||
      params.availableOnly ||
      params.growingPlace ||
      params.sowMonth !== undefined ||
      params.difficulty ||
      params.sort !== "popular"
  );
}

function formatProductCount(value: number) {
  const remainder100 = value % 100;
  const remainder10 = value % 10;
  const noun =
    remainder100 >= 11 && remainder100 <= 14
      ? "товаров"
      : remainder10 === 1
        ? "товар"
        : remainder10 >= 2 && remainder10 <= 4
          ? "товара"
          : "товаров";
  return `${value} ${noun}`;
}

function paramsToUrl(params: ParsedCatalogParams, changes: Partial<ParsedCatalogParams>) {
  const next = new URLSearchParams();
  const merged = { ...params, ...changes };

  if (merged.q) next.set("q", String(merged.q));
  merged.categories.forEach((category) => next.append("category", category));
  merged.manufacturers.forEach((manufacturer) => next.append("manufacturer", manufacturer));
  if (merged.priceFrom !== undefined) next.set("priceFrom", String(merged.priceFrom));
  if (merged.priceTo !== undefined) next.set("priceTo", String(merged.priceTo));
  if (merged.availableOnly) next.set("available", "1");
  if (merged.growingPlace) next.set("place", String(merged.growingPlace));
  if (merged.sowMonth !== undefined) next.set("sowMonth", String(merged.sowMonth));
  if (merged.difficulty) next.set("difficulty", String(merged.difficulty));
  if (merged.sort && merged.sort !== "popular") next.set("sort", String(merged.sort));
  if (merged.page && Number(merged.page) > 1) next.set("page", String(merged.page));

  const query = next.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

function FilterFields({
  params,
  categories,
  options,
}: {
  params: ParsedCatalogParams;
  categories: Awaited<ReturnType<typeof getCatalogCategoryList>>;
  options: Awaited<ReturnType<typeof getCatalogFilterOptions>>;
}) {
  return (
    <>
      <label className={styles.fieldWide}>
        <span>Что хотите вырастить</span>
        <input name="q" type="search" defaultValue={params.q} placeholder="Например, томаты черри" />
      </label>

      <fieldset className={styles.categoryFieldset}>
        <legend>
          <span>Категории</span>
          <span className={styles.categoryFieldHint}>Можно несколько</span>
        </legend>
        <div className={styles.categoryOptions}>
          {categories.map((category) => {
            const isSelected = params.categories.includes(category.slug);
            return (
              <label
                key={category.slug}
                className={styles.categoryOption}
              >
                <input
                  type="checkbox"
                  name="category"
                  value={category.slug}
                  defaultChecked={isSelected}
                />
                <span className={styles.filterCheckbox} aria-hidden="true" />
                <span>{category.name}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.categoryFieldset}>
        <legend>
          <span>Производитель</span>
          <span className={styles.categoryFieldHint}>Можно несколько</span>
        </legend>
        <div className={styles.categoryOptions}>
          {options.manufacturers.map((manufacturer) => {
            const isSelected = params.manufacturers.includes(manufacturer);
            return (
              <label
                key={manufacturer}
                className={styles.categoryOption}
              >
                <input
                  type="checkbox"
                  name="manufacturer"
                  value={manufacturer}
                  defaultChecked={isSelected}
                />
                <span className={styles.filterCheckbox} aria-hidden="true" />
                <span>{manufacturer}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.priceFields}>
        <legend>Цена, ₽</legend>
        <label>
          <span className={styles.srOnly}>Цена от</span>
          <input name="priceFrom" type="number" min="0" inputMode="numeric" defaultValue={params.priceFrom} placeholder="От" />
        </label>
        <span aria-hidden="true">—</span>
        <label>
          <span className={styles.srOnly}>Цена до</span>
          <input name="priceTo" type="number" min="0" inputMode="numeric" defaultValue={params.priceTo} placeholder="До" />
        </label>
      </fieldset>

      {options.growingPlaces.length > 0 ? (
        <label className={styles.field}>
          <span>Место выращивания</span>
          <select name="place" defaultValue={params.growingPlace}>
            <option value="">Любое</option>
            {options.growingPlaces.map((place) => <option key={place} value={place}>{place}</option>)}
          </select>
        </label>
      ) : null}

      {options.sowMonths.length > 0 ? (
        <label className={styles.field}>
          <span>Месяц посева</span>
          <select name="sowMonth" defaultValue={params.sowMonth ?? ""}>
            <option value="">Любой</option>
            {options.sowMonths.map((month) => <option key={month} value={month}>{MONTHS[month - 1]}</option>)}
          </select>
        </label>
      ) : null}

      {options.difficulties.length > 0 ? (
        <label className={styles.field}>
          <span>Уровень опыта</span>
          <select name="difficulty" defaultValue={params.difficulty ?? ""}>
            <option value="">Любой</option>
            {options.difficulties.map((difficulty) => (
              <option key={difficulty} value={difficulty}>{DIFFICULTY_LABELS[difficulty]}</option>
            ))}
          </select>
        </label>
      ) : null}

      <label className={styles.checkField}>
        <input name="available" type="checkbox" value="1" defaultChecked={params.availableOnly} />
        <span className={styles.filterCheckbox} aria-hidden="true" />
        <span>Только доступные к заказу</span>
      </label>

      <CatalogSortControl value={params.sort} options={SORT_OPTIONS} />

      <div className={styles.filterActions}>
        <button type="submit">Применить</button>
        <Link href="/catalog">Сбросить</Link>
      </div>
    </>
  );
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const rawParams = await searchParams;
  const params = parseParams(rawParams);
  const [categories, options, result] = await Promise.all([
    getCatalogCategoryList(),
    getCatalogFilterOptions(),
    queryCatalogProducts({
      q: params.q,
      category: params.categories,
      manufacturer: params.manufacturers,
      priceFrom: params.priceFrom,
      priceTo: params.priceTo,
      availableOnly: params.availableOnly,
      growingPlace: params.growingPlace,
      sowMonth: params.sowMonth,
      difficulty: params.difficulty,
      sort: params.sort,
      page: params.page,
    }),
  ]);

  const selectedCategories = categories.filter((category) =>
    params.categories.includes(category.slug)
  );
  const selectedCategory = selectedCategories.length === 1 ? selectedCategories[0] : undefined;
  const activeFilters: Array<{ key: string; label: string; href: string }> = [];

  if (params.q) {
    activeFilters.push({
      key: "q",
      label: `Поиск: ${params.q}`,
      href: paramsToUrl(params, { q: "", page: 1 }),
    });
  }
  selectedCategories.forEach((category) => {
    activeFilters.push({
      key: `category-${category.slug}`,
      label: category.name,
      href: paramsToUrl(params, {
        categories: params.categories.filter((slug) => slug !== category.slug),
        page: 1,
      }),
    });
  });
  params.manufacturers.forEach((manufacturer) => {
    activeFilters.push({
      key: `manufacturer-${manufacturer}`,
      label: `Производитель: ${manufacturer}`,
      href: paramsToUrl(params, {
        manufacturers: params.manufacturers.filter((item) => item !== manufacturer),
        page: 1,
      }),
    });
  });
  if (params.priceFrom !== undefined) {
    activeFilters.push({
      key: "priceFrom",
      label: `От ${params.priceFrom} ₽`,
      href: paramsToUrl(params, { priceFrom: undefined, page: 1 }),
    });
  }
  if (params.priceTo !== undefined) {
    activeFilters.push({
      key: "priceTo",
      label: `До ${params.priceTo} ₽`,
      href: paramsToUrl(params, { priceTo: undefined, page: 1 }),
    });
  }
  if (params.availableOnly) {
    activeFilters.push({
      key: "availableOnly",
      label: "Доступно к заказу",
      href: paramsToUrl(params, { availableOnly: false, page: 1 }),
    });
  }
  if (params.growingPlace) {
    activeFilters.push({
      key: "growingPlace",
      label: params.growingPlace,
      href: paramsToUrl(params, { growingPlace: "", page: 1 }),
    });
  }
  if (params.sowMonth) {
    activeFilters.push({
      key: "sowMonth",
      label: `Посев: ${MONTHS[params.sowMonth - 1]}`,
      href: paramsToUrl(params, { sowMonth: undefined, page: 1 }),
    });
  }
  if (params.difficulty) {
    activeFilters.push({
      key: "difficulty",
      label: DIFFICULTY_LABELS[params.difficulty],
      href: paramsToUrl(params, { difficulty: undefined, page: 1 }),
    });
  }
  const currentMonth = new Date().getMonth() + 1;
  const greenhousePlace = options.growingPlaces.find((place) =>
    place.toLocaleLowerCase("ru-RU").includes("тепли")
  );
  const quickPresets = [
    {
      label: "Подойдёт новичку",
      href: "/catalog?difficulty=BEGINNER&available=1",
    },
    ...(options.sowMonths.includes(currentMonth)
      ? [
          {
            label: `Сеять в ${MONTHS_PREPOSITIONAL[currentMonth - 1] ?? MONTHS_PREPOSITIONAL[0]}`,
            href: `/catalog?sowMonth=${currentMonth}&available=1`,
          },
        ]
      : []),
    ...(greenhousePlace
      ? [
          {
            label: "Для теплицы",
            href: `/catalog?place=${encodeURIComponent(greenhousePlace)}&available=1`,
          },
        ]
      : []),
  ];
  const hasFilters = hasCatalogFilters(params);
  const siteUrl = getSiteUrl();
  const catalogPath = params.page > 1 ? `/catalog?page=${params.page}` : "/catalog";
  const catalogUrl = `${siteUrl}${catalogPath}`;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${catalogUrl}#collection`,
      url: catalogUrl,
      name:
        params.page > 1
          ? `Каталог семян — страница ${params.page}`
          : "Каталог семян овощей, зелени и цветов",
      description:
        "Семена для дачи, теплицы и балкона с актуальными ценами, наличием и характеристиками выращивания.",
      inLanguage: "ru-RU",
      mainEntity: { "@id": `${catalogUrl}#products` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Каталог семян", item: catalogUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${catalogUrl}#products`,
      name: "Семена в каталоге",
      numberOfItems: result.total,
      itemListElement: result.items.map((item, index) => ({
        "@type": "ListItem",
        position: (result.page - 1) * result.pageSize + index + 1,
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
      <CatalogPositionRestorer />
      {!hasFilters ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
          }}
        />
      ) : null}
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.kicker}>Семена с понятными характеристиками</p>
          <h1 className={styles.title}>
            {params.q ? `Результаты поиска: «${params.q}»` : selectedCategory?.name ??
              (selectedCategories.length > 1
                ? "Семена из выбранных категорий"
                : "Купить семена для дачи и огорода")}
          </h1>
          <details className={styles.catalogHelp}>
            <summary>Как выбрать семена</summary>
            <p>Выбирайте семена овощей, зелени и цветов по сроку посева, месту выращивания и уровню опыта. Цены и наличие в карточках актуальны на момент заказа.</p>
            <nav className={styles.quickPresets} aria-label="Быстрые подборки на телефоне">
              {quickPresets.map(preset => <Link key={preset.href} href={preset.href}>{preset.label}</Link>)}
            </nav>
          </details>
          <p className={styles.subtitle}>
            Выбирайте семена овощей, зелени и цветов по сроку посева, месту выращивания
            и уровню опыта. Цены и наличие в карточках актуальны на момент заказа.
          </p>
          <a href="#catalog-results" className={styles.jumpToProducts}>К товарам · {result.total}</a>
        </header>

        <nav className={styles.categoryRail} aria-label="Категории каталога">
          <Link
            href={paramsToUrl(params, { categories: [], page: 1 })}
            className={params.categories.length === 0 ? styles.categoryActive : styles.categoryLink}
          >
            Все
          </Link>
          {categories.map((category) => {
            const isSelected = params.categories.includes(category.slug);
            const nextCategories = isSelected
              ? params.categories.filter((slug) => slug !== category.slug)
              : [...params.categories, category.slug];
            return (
              <Link
                key={category.slug}
                href={paramsToUrl(params, { categories: nextCategories, page: 1 })}
                className={isSelected ? styles.categoryActive : styles.categoryLink}
                aria-label={`${isSelected ? "Убрать" : "Добавить"} категорию «${category.name}»`}
              >
                {category.name}
              </Link>
            );
          })}
        </nav>

        <section className={styles.discoveryPanel} aria-labelledby="catalog-discovery-title">
          <div>
            <p>Если пока не знаете название культуры</p>
            <h2 id="catalog-discovery-title">Ответьте на три вопроса — покажем подходящие семена</h2>
          </div>
          <Link href="/selection" className={styles.discoveryAction}>
            Начать подбор <span aria-hidden="true">→</span>
          </Link>
          <nav className={styles.quickPresets} aria-label="Быстрые подборки">
            {quickPresets.map((preset) => (
              <Link key={preset.href} href={preset.href}>{preset.label}</Link>
            ))}
          </nav>
        </section>

        <details className={styles.mobileFilters}>
          <summary>Фильтры{activeFilters.length ? ` · ${activeFilters.length}` : ""}</summary>
          <form action="/catalog" method="get" className={styles.mobileFilterForm}>
            <FilterFields params={params} categories={categories} options={options} />
          </form>
        </details>

        <div className={styles.catalogLayout}>
          <aside className={styles.sidebar} aria-label="Фильтры каталога">
            <form action="/catalog" method="get" className={styles.filterPanel}>
              <h2>Фильтры</h2>
              <FilterFields params={params} categories={categories} options={options} />
            </form>
          </aside>

          <section id="catalog-results" className={styles.results} aria-labelledby="catalog-results-title" tabIndex={-1}>
            <div className={styles.resultsToolbar}>
              <div>
                <h2 id="catalog-results-title">{result.total === 0 ? "Ничего не найдено" : formatProductCount(result.total)}</h2>
                {result.total > 0 ? <p>Страница {result.page} из {result.totalPages}</p> : null}
              </div>
            </div>

            {activeFilters.length > 0 ? (
              <div className={styles.activeFilters} aria-label="Активные фильтры">
                {activeFilters.map((filter) => (
                  <Link key={filter.key} href={filter.href}>
                    {filter.label}<span aria-hidden="true">×</span>
                  </Link>
                ))}
                <Link href="/catalog" className={styles.clearFilters}>Очистить всё</Link>
              </div>
            ) : null}

            {result.items.length === 0 ? (
              <div className={styles.emptyState}>
                <h2>{params.q ? `По запросу «${params.q}» товаров не найдено` : "По выбранным условиям товаров не найдено"}</h2>
                <p>{activeFilters.some(filter => filter.key !== "q")
                  ? "Попробуйте убрать одно из выбранных условий. Запрос и остальные фильтры сохранятся."
                  : "Проверьте название или код товара, попробуйте название культуры или производителя."}</p>
                <Link href="/catalog">Показать весь каталог</Link>
              </div>
            ) : (
              <div className={styles.grid}>
                {result.items.map((product, index) => (
                  <ProductCard key={product.id} product={product} returnTo={paramsToUrl(params, { page: result.page })} loading={index < 4 ? "eager" : "lazy"} />
                ))}
              </div>
            )}

            {result.totalPages > 1 ? (
              <nav className={styles.pagination} aria-label="Страницы каталога">
                {result.page > 1 ? <Link href={paramsToUrl(params, { page: result.page - 1 })}>← Назад</Link> : <span />}
                <div>
                  {Array.from({ length: result.totalPages }, (_, index) => index + 1)
                    .filter((page) => page === 1 || page === result.totalPages || Math.abs(page - result.page) <= 1)
                    .map((page, index, pages) => (
                      <span key={page} className={styles.pageItem}>
                        {index > 0 && page - (pages[index - 1] ?? 0) > 1 ? <span className={styles.ellipsis}>…</span> : null}
                        <Link href={paramsToUrl(params, { page })} aria-current={page === result.page ? "page" : undefined}>{page}</Link>
                      </span>
                    ))}
                </div>
                {result.page < result.totalPages ? <Link href={paramsToUrl(params, { page: result.page + 1 })}>Вперёд →</Link> : <span />}
              </nav>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
