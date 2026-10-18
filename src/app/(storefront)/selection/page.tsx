import type { Metadata } from "next";
import {
  getCatalogFilterOptions,
  getCatalogProducts,
} from "@/entities/product/model/catalog-data";
import { createPageMetadata } from "@/lib/seo";
import SeedSelector from "./seed-selector";
import styles from "./selection.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "Подбор семян для дачи и теплицы",
  description:
    "Подберём семена для открытого грунта, теплицы или балкона по вашему опыту и месяцу посева. Три коротких вопроса — только подходящие товары из наличия.",
  path: "/selection",
  keywords: ["подбор семян", "какие семена выбрать", "семена для начинающих"],
});

export default async function SelectionPage() {
  const [products, options] = await Promise.all([
    getCatalogProducts(),
    getCatalogFilterOptions(),
  ]);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <p className={styles.kicker}>Три коротких шага</p>
          <h1>Подберите семена под свои условия</h1>
          <p>
            Укажите, где будете выращивать, насколько уверенно чувствуете себя с рассадой
            и когда планируете посев. Подбор работает по характеристикам товаров, без
            случайных советов.
          </p>
        </header>

        <SeedSelector
          products={products}
          growingPlaces={options.growingPlaces}
          sowMonths={options.sowMonths}
        />
      </div>
    </main>
  );
}
