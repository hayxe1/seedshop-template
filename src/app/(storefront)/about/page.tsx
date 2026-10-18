import Link from "next/link";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";
import styles from "../content-page.module.css";

export const metadata: Metadata = createPageMetadata({
  title: "О магазине семян",
  description:
    "Интернет-магазин «Магазин семян»: помогаем выбрать семена по месту выращивания, срокам посева и опыту. Актуальное наличие, самовывоз и доставка по Воронежу.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <article className={styles.card}>
          <h1 className={styles.title}>Интернет-магазин семян «Магазин семян»</h1>
          <p className={styles.lead}>
            &laquo;Магазин семян&raquo; помогает выбрать семена не по красивой
            упаковке, а по реальным условиям: где они будут расти, когда их сеять и
            сколько опыта потребуется.
          </p>

          <section className={styles.section}>
            <h2>Как мы упростили выбор</h2>
            <ul className={styles.list}>
              <li>
                В каталоге можно искать и фильтровать семена по категории, месту
                выращивания, сложности и срокам.
              </li>
              <li>
                Быстрый подбор задаёт три простых вопроса и объясняет, почему предлагает
                конкретные позиции.
              </li>
              <li>
                Календарь показывает посев, пересадку и сбор урожая по месяцам, а карточки
                товаров предлагают действительно близкие варианты.
              </li>
              <li>
                Наличие ведётся в самом магазине, поэтому недоступный товар нельзя
                оплатить случайно.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Как проходит заказ</h2>
            <ul className={styles.list}>
              <li>Регистрация не нужна: достаточно имени и телефона.</li>
              <li>Товары оплачиваются онлайн на защищённой странице YooKassa.</li>
              <li>
                На старте магазин работает для Воронежа: бесплатный самовывоз или
                согласованная отдельно городская доставка.
              </li>
              <li>
                Если нужна помощь с выбором или заказом, можно связаться с нами напрямую.
              </li>
            </ul>
          </section>

          <div className={styles.actions}>
            <Link href="/catalog" className={styles.btnPrimary}>
              Открыть каталог
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
