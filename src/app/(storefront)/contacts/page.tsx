import Link from "next/link";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";
import styles from "../content-page.module.css";

export const metadata: Metadata = createPageMetadata({
  title: "Контакты интернет-магазина семян в Воронеже",
  description:
    "Контакты интернет-магазина семян «Магазин семян» в Воронеже: телефон, email, режим работы и условия бесплатного самовывоза. Поможем с выбором и заказом.",
  path: "/contacts",
  keywords: ["магазин семян Воронеж", "семена Воронеж контакты"],
});

export default function ContactsPage() {
  return (
    <main className={`${styles.page} ${styles.pageContacts}`}>
      <div className={styles.container}>
        <article className={styles.card}>
          <h1 className={styles.title}>Контакты магазина семян в Воронеже</h1>
          <p className={styles.lead}>
            Поможем подобрать семена под ваши условия, ответим по заказу, оплате и доставке.
          </p>

          <section className={styles.section}>
            <h2>Как с нами связаться</h2>
            <dl className={styles.details}>
              <div className={styles.detailRow}>
                <dt>Телефон</dt>
                <dd>
                  <span>[Телефон продавца]</span>
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Email</dt>
                <dd>
                  <a href="mailto:shop@example.com">shop@example.com</a>
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Режим работы</dt>
                <dd>[Укажите режим работы магазина]</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Самовывоз</dt>
                <dd>
                  Бесплатно в Воронеже по предварительному согласованию. Место и время
                  сообщаем лично после оформления заказа.
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Почтовый адрес</dt>
                <dd>
                  [Почтовый адрес продавца]. Это адрес
                  для корреспонденции, не пункт самовывоза.
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.section}>
            <h2>Реквизиты продавца</h2>
            <ul className={styles.list}>
              <li>[Наименование продавца]</li>
              <li>ИНН [ИНН продавца]</li>
              <li>ОГРНИП [ОГРН / ОГРНИП продавца]</li>
            </ul>
          </section>



          <div className={styles.actions}>
            <Link href="/catalog" className={styles.btnPrimary}>
              Перейти в каталог
            </Link>
            <Link href="/offer" className={styles.btnSecondary}>
              Оферта
            </Link>
          </div>
        </article>
      </div>
    </main>
  );
}
