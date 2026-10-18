import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedSeedSets } from "@/entities/product/model/catalog-data";
import { createPageMetadata } from "@/lib/seo";
import SeedSetCard from "./seed-set-card";
import styles from "./sets.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "Наборы семян для огорода и теплицы",
  description:
    "Купите готовые наборы семян для первого огорода, зелени и теплицы. Понятный состав, выгодная цена, заказ без регистрации и доставка по Воронежу.",
  path: "/sets",
  keywords: ["наборы семян", "готовые наборы семян", "набор семян для огорода"],
});

export default async function SetsPage() {
  const seedSets = await getPublishedSeedSets();

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Подобрано за вас</p>
            <h1>Готовые наборы семян</h1>
            <p className={styles.heroLead}>
              Каждая коробка собрана под конкретную задачу: начать первый огород,
              вырастить зелень или подготовить теплицу к сезону.
            </p>
          </div>
          <div className={styles.heroAside}>
            <p>Нужен набор именно под ваши условия?</p>
            <Link href="/selection" className={styles.outlineButton}>
              Подобрать семена
            </Link>
          </div>
        </header>

        <div className={styles.guarantees} aria-label="Преимущества готовых наборов">
          <span>Понятный состав</span>
          <span>Цена ниже, чем по отдельности</span>
          <span>Один клик до корзины</span>
        </div>

        {seedSets.length === 0 ? (
          <section className={styles.emptyState}>
            <p className={styles.kicker}>Коллекция готовится</p>
            <h2>Новые наборы скоро появятся</h2>
            <p>
              А пока можно пройти короткий подбор или выбрать семена вручную в каталоге.
            </p>
            <div className={styles.emptyActions}>
              <Link href="/selection" className={styles.primaryButton}>Подобрать семена</Link>
              <Link href="/catalog" className={styles.outlineButton}>Открыть каталог</Link>
            </div>
          </section>
        ) : (
          <section className={styles.collection} aria-labelledby="sets-collection-title">
            <div className={styles.collectionHead}>
              <div>
                <p className={styles.kicker}>Коллекция</p>
                <h2 id="sets-collection-title">Выберите свою задачу</h2>
              </div>
              <p>{seedSets.length} {seedSets.length === 1 ? "готовый набор" : "готовых наборов"}</p>
            </div>
            <div className={styles.grid}>
              {seedSets.map((seedSet) => (
                <SeedSetCard key={seedSet.id} seedSet={seedSet} />
              ))}
            </div>
          </section>
        )}

        <section className={styles.selectionCta}>
          <div>
            <p className={styles.kicker}>Не нашли подходящий?</p>
            <h2>Соберём подборку под ваши условия</h2>
          </div>
          <Link href="/selection" className={styles.outlineButton} data-testid="sets-catalog-cta">
            Пройти короткий подбор
          </Link>
        </section>
      </div>
    </main>
  );
}
