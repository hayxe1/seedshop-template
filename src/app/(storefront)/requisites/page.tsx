import Link from "next/link";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";
import styles from "../content-page.module.css";

const requisites = [
  {
    label: "Продавец",
    value: "[Полное наименование продавца]",
  },
  {
    label: "ИНН",
    value: "[ИНН продавца]",
  },
  {
    label: "ОГРНИП",
    value: "[ОГРН / ОГРНИП продавца]",
  },
  {
    label: "Телефон",
    value: "[Телефон продавца]",
  },
  {
    label: "Email",
    value: "shop@example.com",
    href: "mailto:shop@example.com",
  },
];

export const metadata: Metadata = createPageMetadata({
  title: "Реквизиты интернет-магазина",
  description:
    "Юридические реквизиты продавца интернет-магазина семян «Магазин семян»: наименование ИП, ИНН, ОГРНИП, телефон и email.",
  path: "/requisites",
});

export default function RequisitesPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <article className={styles.card}>
          <h1 className={styles.title}>Реквизиты</h1>
          <p className={styles.lead}>
            Юридическая информация продавца интернет-магазина Магазин семян.
          </p>

          <section className={styles.section}>
            <h2>Данные продавца</h2>
            <ul className={`${styles.list} ${styles.requisitesList}`}>
              {requisites.map((item) => (
                <li key={item.label}>
                  <strong>{item.label}</strong>
                  {item.href ? <a href={item.href}>{item.value}</a> : item.value}
                </li>
              ))}
            </ul>
          </section>

          <div className={styles.actions}>
            <Link href="/catalog" className={styles.btnPrimary}>
              Перейти в каталог
            </Link>
            <Link href="/contacts" className={styles.btnSecondary}>
              Связаться с нами
            </Link>
          </div>
        </article>
      </div>
    </main>
  );
}
