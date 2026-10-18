import Link from "next/link";
import type { Metadata } from "next";
import { AnalyticsConsentControls } from "@/shared/analytics/analytics-consent-controls";
import { createPageMetadata } from "@/lib/seo";
import { LEGAL_DOCUMENT_VERSION } from "@/shared/legal/version";
import styles from "../content-page.module.css";

export const metadata: Metadata = createPageMetadata({ title: "Политика обработки персональных данных", description: "Структура документа для заполнения продавцом перед запуском магазина.", path: "/privacy", robots: { index: false, follow: false } });

export default function LegalPage() {
  return <main className={styles.page}><div className={styles.container}><article className={styles.card}>
    <h1 className={styles.title}>Политика обработки персональных данных</h1>
    <p className={styles.lead}>Шаблон документа — не готовый юридический документ. Данные продавца и условия необходимо заполнить и согласовать до запуска. Версия: {LEGAL_DOCUMENT_VERSION}.</p>
          <section className={styles.section}>
            <h2>Оператор данных</h2>
            <p>[Раздел для адаптации: оператор данных. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>

          <section className={styles.section}>
            <h2>Какие данные обрабатываются</h2>
            <p>[Раздел для адаптации: какие данные обрабатываются. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>

          <section className={styles.section}>
            <h2>Цели обработки</h2>
            <p>[Раздел для адаптации: цели обработки. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>

          <section className={styles.section}>
            <h2>Передача и хранение</h2>
            <p>[Раздел для адаптации: передача и хранение. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>

          <section className={styles.section}>
            <h2>Локальное хранение в браузере</h2>
            <p>[Раздел для адаптации: локальное хранение в браузере. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>

          <section className={styles.section}>
            <h2>Отзыв согласия</h2>
            <p>[Раздел для адаптации: отзыв согласия. Подготовьте текст для конкретного продавца, его процессов и подключённых сервисов до приёма реальных заказов.]</p>
          </section>
    <section className={styles.section}><h2>Настройки аналитики</h2><AnalyticsConsentControls /></section>
    <div className={styles.actions}><Link href="/contacts" className={styles.btnPrimary}>Контакты</Link><Link href="/catalog" className={styles.btnSecondary}>Перейти в каталог</Link></div>
  </article></div></main>;
}
