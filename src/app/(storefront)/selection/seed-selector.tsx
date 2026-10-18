"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CatalogProduct } from "@/entities/product/model/catalog-data";
import ProductCard from "@/features/catalog/product-card";
import styles from "./selection.module.css";

type Difficulty = "BEGINNER" | "INTERMEDIATE" | "EXPERIENCED";

type SeedSelectorProps = {
  products: CatalogProduct[];
  growingPlaces: string[];
  sowMonths: number[];
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

const DIFFICULTY_OPTIONS: Array<{
  value: Difficulty;
  title: string;
  text: string;
}> = [
  {
    value: "BEGINNER",
    title: "Только начинаю",
    text: "Нужны неприхотливые культуры и понятный уход.",
  },
  {
    value: "INTERMEDIATE",
    title: "Есть небольшой опыт",
    text: "Готов следить за рассадой и соблюдать сроки.",
  },
  {
    value: "EXPERIENCED",
    title: "Выращиваю давно",
    text: "Можно показать культуры с более требовательным уходом.",
  },
];

function placeMatches(product: CatalogProduct, place: string) {
  return product.growingPlaces.includes(place);
}

const MONTHS_LOCATIVE = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];

function reasonFor(
  product: CatalogProduct,
  place: string,
  difficulty: Difficulty,
  month: number
) {
  const reasons: string[] = [];
  if (placeMatches(product, place)) reasons.push(`подходит для «${place}»`);
  if (product.difficulty === difficulty) reasons.push("совпадает с вашим уровнем опыта");
  if (product.sowMonths.includes(month)) reasons.push(`можно сеять в ${MONTHS_LOCATIVE[month - 1]}`);
  return reasons.slice(0, 2).join(" · ");
}

export default function SeedSelector({
  products,
  growingPlaces,
  sowMonths,
}: SeedSelectorProps) {
  const placeOptions =
    growingPlaces.length > 0
      ? growingPlaces
      : ["Открытый грунт", "Теплица", "Балкон"];
  const monthOptions =
    sowMonths.length > 0 ? sowMonths : Array.from({ length: 12 }, (_, index) => index + 1);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [place, setPlace] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [month, setMonth] = useState<number | null>(null);

  const rankedProducts = useMemo(() => {
    if (!place || !difficulty || !month) return [];

    const ranked = products
      .filter((product) =>
        product.isAvailable &&
        placeMatches(product, place) &&
        product.difficulty === difficulty &&
        product.sowMonths.includes(month)
      )
      .map((product) => ({ product }))
      .sort((left, right) =>
        Number(right.product.isPopularToday) - Number(left.product.isPopularToday) ||
        Number(right.product.isNew) - Number(left.product.isNew) ||
        left.product.name.localeCompare(right.product.name, "ru")
      );

    const diverse: typeof ranked = [];
    const usedCategories = new Set<string>();

    for (const result of ranked) {
      if (!usedCategories.has(result.product.categorySlug)) {
        diverse.push(result);
        usedCategories.add(result.product.categorySlug);
      }
      if (diverse.length === 8) return diverse;
    }

    for (const result of ranked) {
      if (!diverse.includes(result)) {
        diverse.push(result);
      }
      if (diverse.length === 8) break;
    }

    return diverse;
  }, [difficulty, month, place, products]);

  const catalogHref = useMemo(() => {
    if (!place || !difficulty || !month) return "/catalog";
    const params = new URLSearchParams({
      place,
      difficulty,
      sowMonth: String(month),
      available: "1",
    });
    return `/catalog?${params.toString()}`;
  }, [difficulty, month, place]);

  const reset = () => {
    setPlace("");
    setDifficulty("");
    setMonth(null);
    setStep(1);
  };

  return (
    <section className={styles.selector} aria-labelledby="selector-title">
      <div className={styles.progressHeader}>
        <div>
          <span>Подбор семян</span>
          <strong id="selector-title">
            {step === 4 ? "Подходящие варианты" : `Шаг ${step} из 3`}
          </strong>
        </div>
        <div className={styles.progressTrack} aria-hidden="true">
          <span style={{ width: `${Math.min(step, 3) * 33.333}%` }} />
        </div>
      </div>

      {step === 1 ? (
        <div className={styles.stepPanel}>
          <div className={styles.stepIntro}>
            <span>01</span>
            <div>
              <h2>Где будут расти растения?</h2>
              <p>Выберите основное место — это сильнее всего влияет на подбор.</p>
            </div>
          </div>
          <div className={styles.optionGrid}>
            {placeOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={styles.optionButton}
                onClick={() => {
                  setPlace(option);
                  setStep(2);
                }}
              >
                <strong>{option}</strong>
                <span>Показать культуры для этих условий</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className={styles.stepPanel}>
          <div className={styles.stepIntro}>
            <button type="button" onClick={() => setStep(1)} aria-label="Вернуться к месту выращивания">
              ←
            </button>
            <div>
              <h2>Какой у вас опыт?</h2>
              <p>Не оцениваем знания — только подбираем комфортный уровень ухода.</p>
            </div>
          </div>
          <div className={styles.optionGrid}>
            {DIFFICULTY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.optionButton}
                onClick={() => {
                  setDifficulty(option.value);
                  setStep(3);
                }}
              >
                <strong>{option.title}</strong>
                <span>{option.text}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className={styles.stepPanel}>
          <div className={styles.stepIntro}>
            <button type="button" onClick={() => setStep(2)} aria-label="Вернуться к выбору опыта">
              ←
            </button>
            <div>
              <h2>Когда планируете сеять?</h2>
              <p>Выберите месяц ближайшего посева. Сроки в карточках остаются ориентировочными.</p>
            </div>
          </div>
          <div className={styles.monthGrid}>
            {monthOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setMonth(option);
                  setStep(4);
                }}
              >
                <span>{String(option).padStart(2, "0")}</span>
                <strong>{MONTHS[option - 1]}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 4 && difficulty && month ? (
        <div className={styles.resultsPanel}>
          <div className={styles.resultHeading}>
            <div>
              <p>Ваши условия</p>
              <h2>
                {place} · {DIFFICULTY_OPTIONS.find((item) => item.value === difficulty)?.title} ·{" "}
                {MONTHS[month - 1]}
              </h2>
              <span>
                Сначала показываем товары с наибольшим числом совпадений и доступным остатком.
              </span>
            </div>
            <button type="button" onClick={reset}>Пройти заново</button>
          </div>

          {rankedProducts.length > 0 ? (
            <div className={styles.resultGrid}>
              {rankedProducts.map(({ product }) => (
                <div key={product.id} className={styles.resultCard}>
                  <p>{reasonFor(product, place, difficulty, month)}</p>
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <h3>Точного совпадения пока нет</h3>
              <p>Откройте каталог и снимите один из фильтров — подходящий вариант может быть без заполненных характеристик.</p>
            </div>
          )}

          <div className={styles.resultActions}>
            <Link href={catalogHref}>Открыть все совпадения в каталоге</Link>
            <Link href="/catalog">Выбрать семена вручную</Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
