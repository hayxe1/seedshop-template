import Link from "next/link";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";
import { LEGAL_DOCUMENT_VERSION } from "@/shared/legal/version";
import styles from "../content-page.module.css";

export const metadata: Metadata = createPageMetadata({ title: "Публичная оферта", description: "Структура документа для заполнения продавцом перед запуском магазина.", path: "/offer", robots: { index: false, follow: false } });

export default function LegalPage() {
  return <main className={styles.page}><div className={styles.container}><article className={styles.card}>
    <h1 className={styles.title}>Публичная оферта</h1>
    <p className={styles.lead}>Шаблон документа — не готовый юридический документ. Данные продавца и условия необходимо заполнить и согласовать до запуска. Версия: {LEGAL_DOCUMENT_VERSION}.</p>
          <section className={styles.section}>
            <h2>Продавец</h2>
            <p>[Раздел для адаптации: продавец. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>

          <section className={styles.section}>
            <h2>Товары и оформление заказа</h2>
            <p>[Раздел для адаптации: товары и оформление заказа. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>

          <section className={styles.section}>
            <h2>Оплата и доставка</h2>
            <p>[Раздел для адаптации: оплата и доставка. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>

          <section className={styles.section}>
            <h2>Возврат и отмена</h2>
            <p>[Раздел для адаптации: возврат и отмена. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>

          <section className={styles.section}>
            <h2>Контакты для обращений</h2>
            <p>[Раздел для адаптации: контакты для обращений. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>
    <div className={styles.actions}><Link href="/contacts" className={styles.btnPrimary}>Контакты</Link><Link href="/catalog" className={styles.btnSecondary}>Перейти в каталог</Link></div>
  </article></div></main>;
}
