import Link from "next/link";
import type { CatalogSeedSet } from "@/entities/product/model/catalog-data";
import FeaturedSetsPreview from "@/features/home/featured-sets-preview";
import styles from "@/features/home/home.module.css";

type NewbieSectionProps = {
  starterChecklist: string[];
  featuredSeedSets: CatalogSeedSet[];
};

export default function NewbieSection({
  starterChecklist,
  featuredSeedSets,
}: NewbieSectionProps) {
  return (
    <section className={`${styles.section} ${styles.sectionSoft}`}>
      <div className={`${styles.container} ${styles.newbieLayout}`}>
        <div>
          <div className={styles.sectionHead}>
            <h2>С чего начать новичку</h2>
            <p>Три понятных шага, чтобы собрать стартовый набор без лишней теории.</p>
          </div>

          <ol className={styles.stepList}>
            {starterChecklist.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <div className={styles.heroActions}>
            <Link href="/sets" className={styles.primaryButton}>
              Смотреть готовые наборы
            </Link>
            <Link href="/selection" className={styles.secondaryButton}>
              Собрать свой набор
            </Link>
          </div>
        </div>

        <div className={styles.constructorPane}>
          <FeaturedSetsPreview seedSets={featuredSeedSets} />
        </div>
      </div>
    </section>
  );
}
