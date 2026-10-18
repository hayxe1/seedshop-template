import Image from "next/image";
import Link from "next/link";
import styles from "@/features/home/home.module.css";
import type { CategoryCard } from "./content";

type CategorySectionProps = {
  categoryCards: CategoryCard[];
};

export default function CategorySection({ categoryCards }: CategorySectionProps) {
  return (
    <section className={styles.section} aria-labelledby="quick-categories-title">
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <h2 id="quick-categories-title">Быстрый вход в категории</h2>
        </div>

        <div className={styles.categoryGrid}>
          {categoryCards.map((category) => (
            <Link key={category.slug} href={category.href} className={styles.categoryCard} prefetch={false}>
              <Image
                src={category.iconSrc}
                alt=""
                width={72}
                height={72}
                className={styles.categoryIcon}
                aria-hidden="true"
              />
              <span>{category.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
