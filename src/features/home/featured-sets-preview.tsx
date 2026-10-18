import Image from "next/image";
import Link from "next/link";
import type { CatalogSeedSet } from "@/entities/product/model/catalog-data";
import styles from "./featured-sets-preview.module.css";

type FeaturedSetsPreviewProps = {
  seedSets: CatalogSeedSet[];
};

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export default function FeaturedSetsPreview({ seedSets }: FeaturedSetsPreviewProps) {
  const visibleSets = seedSets.slice(0, 3);

  if (visibleSets.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Готовые наборы</p>
        <strong>Новые подборки уже собираются</strong>
        <Link href="/selection">Подобрать семена под себя →</Link>
      </div>
    );
  }

  return (
    <section className={styles.preview} aria-label="Популярные готовые наборы">
      <div className={styles.heading}>
        <div>
          <p>Готовые решения</p>
          <strong>Можно начать с набора</strong>
        </div>
        <Link href="/sets">Смотреть все</Link>
      </div>

      <div className={styles.grid}>
        {visibleSets.map((seedSet, index) => {
          const fallbackImage = seedSet.items.find((item) => item.imageUrl)?.imageUrl;
          return (
            <Link
              key={seedSet.id}
              href={`/sets/${seedSet.slug}`}
              prefetch={false}
              className={`${styles.card} ${index === 0 ? styles.featured : ""}`}
            >
              <span className={styles.media}>
                {seedSet.imageUrl || fallbackImage ? (
                  <Image
                    src={(seedSet.imageUrl || fallbackImage)!}
                    alt=""
                    fill
                    className={styles.image}
                    sizes="(max-width: 820px) 100vw, 44vw"
                  />
                ) : (
                  <span className={styles.fallback}>{seedSet.name.slice(0, 1)}</span>
                )}
                <span className={styles.itemCount}>{seedSet.items.length} позиций</span>
              </span>
              <span className={styles.copy}>
                <span className={styles.meta}>Готовый набор</span>
                <strong>{seedSet.name}</strong>
                <span className={styles.bottom}>
                  <b>{formatPrice(seedSet.price)}</b>
                  <i aria-hidden="true">→</i>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
