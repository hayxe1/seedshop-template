import Link from "next/link";
import type { Metadata } from "next";
import { queryCatalogProducts } from "@/entities/product/model/catalog-data";
import ProductCard from "@/features/catalog/product-card";
import { createPageMetadata } from "@/lib/seo";
import styles from "./page.module.css";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"] as const;
const MONTHS_PREPOSITIONAL = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"] as const;
const MODES = {
  sow: {
    label: "Посев",
    action: "сеять",
    resultTitle: "Семена для посева",
  },
  transplant: {
    label: "Пересадка",
    action: "пересаживать",
    resultTitle: "Культуры для пересадки",
  },
  harvest: {
    label: "Сбор урожая",
    action: "собирать",
    resultTitle: "Культуры со сроком сбора",
  },
} as const;
type CalendarMode = keyof typeof MODES;
type CalendarSearchParams = {
  month?: string | string[];
  mode?: string | string[];
};

const SEASON_NOTES = {
  winter: {
    title: "Время проверить запасы и спланировать рассаду",
    text: "Составьте короткий список культур, сверяйте срок созревания и не сейте раньше, чем сможете обеспечить растениям достаточно света.",
  },
  spring: {
    title: "Основной сезон посева и подготовки грядок",
    text: "Ориентируйтесь на температуру почвы и риск возвратных заморозков. Для теплицы и открытого грунта сроки могут заметно отличаться.",
  },
  summer: {
    title: "Повторные посевы и уход за растениями",
    text: "Быстрорастущую зелень можно сеять небольшими партиями. Следите за влажностью, а полив переносите на прохладные часы.",
  },
  autumn: {
    title: "Сбор урожая и подготовка следующего сезона",
    text: "Запишите сорта, которые показали себя лучше всего, соберите урожай вовремя и проверьте культуры для подзимнего посева.",
  },
} as const;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<CalendarSearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const rawMonth = Array.isArray(params.month) ? params.month[0] : params.month;
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const hasExplicitMonth = Boolean(rawMonth && /^(?:[1-9]|1[0-2])$/.test(rawMonth));

  if (!hasExplicitMonth && !rawMode) {
    return createPageMetadata({
      title: "Календарь посева семян по месяцам",
      description:
        "Календарь посева, пересадки и сбора урожая по месяцам. Найдите подходящие семена для теплицы, открытого грунта или балкона и спланируйте сезон.",
      path: "/calendar",
      keywords: ["календарь посева", "календарь посадки семян", "что сеять по месяцам"],
    });
  }

  const month = parseMonth(params.month);
  const mode = parseMode(params.mode);
  const monthName = MONTHS_PREPOSITIONAL[month - 1] ?? MONTHS_PREPOSITIONAL[0];
  const path =
    mode === "sow"
      ? `/calendar?month=${month}`
      : `/calendar?month=${month}&mode=${mode}`;
  const title =
    mode === "sow"
      ? `Что сеять в ${monthName} — календарь посева`
      : mode === "transplant"
        ? `Что пересаживать в ${monthName} — календарь садовода`
        : `Что собирать в ${monthName} — календарь урожая`;
  const description =
    mode === "sow"
      ? `Что можно сеять в ${monthName}: подходящие семена из наличия, ориентировочные сроки и советы для теплицы, открытого грунта и балкона.`
      : mode === "transplant"
        ? `Что можно пересаживать в ${monthName}: культуры из каталога, ориентировочные сроки и подсказки для планирования работ в саду и огороде.`
        : `Что можно собирать в ${monthName}: культуры из каталога с ориентировочными сроками урожая и подсказками для планирования сезона.`;

  return createPageMetadata({
    title,
    description,
    path,
    keywords: [title, `${MODES[mode].action} в ${monthName}`, "календарь огородника"],
  });
}

function parseMonth(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const number = Number(raw);
  return Number.isInteger(number) && number >= 1 && number <= 12 ? number : new Date().getMonth() + 1;
}

function seasonForMonth(month: number) {
  if (month <= 2 || month === 12) return SEASON_NOTES.winter;
  if (month <= 5) return SEASON_NOTES.spring;
  if (month <= 8) return SEASON_NOTES.summer;
  return SEASON_NOTES.autumn;
}

function parseMode(value: string | string[] | undefined): CalendarMode {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "transplant" || raw === "harvest" ? raw : "sow";
}

export default async function SowingCalendarPage({ searchParams }: { searchParams: Promise<CalendarSearchParams> }) {
  const params = await searchParams;
  const month = parseMonth(params.month);
  const mode = parseMode(params.mode);
  const result = await queryCatalogProducts({
    ...(mode === "sow"
      ? { sowMonth: month }
      : mode === "transplant"
        ? { transplantMonth: month }
        : { harvestMonth: month }),
    availableOnly: true,
    pageSize: 48,
    sort: "popular",
  });
  const note = seasonForMonth(month);
  const modeContent = MODES[mode];

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <p>Планирование сезона</p>
          <h1>Что {modeContent.action} в {MONTHS_PREPOSITIONAL[month - 1] ?? MONTHS_PREPOSITIONAL[0]}</h1>
          <span>Календарь строится по характеристикам товаров. Сроки ориентировочные — учитывайте свой регион, погоду и способ выращивания.</span>
        </header>

        <nav className={styles.modeRail} aria-label="Режим календаря">
          {Object.entries(MODES).map(([value, content]) => (
            <Link
              key={value}
              href={`/calendar?month=${month}&mode=${value}`}
              aria-current={value === mode ? "page" : undefined}
            >
              {content.label}
            </Link>
          ))}
        </nav>

        <nav className={styles.monthRail} aria-label="Выбрать месяц">
          {MONTHS.map((label, index) => {
            const value = index + 1;
            return <Link key={label} href={`/calendar?month=${value}&mode=${mode}`} aria-current={value === month ? "page" : undefined}>{label.slice(0, 3)}</Link>;
          })}
        </nav>

        <section className={styles.seasonNote}>
          <span>{String(month).padStart(2, "0")}</span>
          <div><h2>{note.title}</h2><p>{note.text}</p></div>
        </section>

        <section className={styles.products} aria-labelledby="calendar-products-title">
          <div className={styles.sectionHeader}>
            <div><p>Подходящие позиции</p><h2 id="calendar-products-title">{modeContent.resultTitle}</h2></div>
            {mode === "sow" ? <Link href={`/catalog?sowMonth=${month}&available=1`}>Открыть с фильтрами →</Link> : <Link href="/selection">Подобрать по условиям →</Link>}
          </div>
          {result.items.length > 0 ? (
            <div className={styles.grid}>{result.items.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          ) : (
            <div className={styles.empty}>
              <h3>Для этого месяца пока нет размеченных товаров</h3>
              <p>Каталог продолжает работать: выберите культуру вручную или загляните в соседний месяц.</p>
              <Link href="/catalog">Перейти в каталог</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
