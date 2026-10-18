import Link from "next/link";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";
import styles from "../content-page.module.css";

export const metadata: Metadata = createPageMetadata({
  title: "Оплата заказа семян онлайн",
  description:
    "Оплачивайте семена онлайн банковской картой через защищённую страницу YooKassa. Заказ без регистрации, понятный статус оплаты и подтверждение покупки.",
  path: "/payment",
});

export default function PaymentPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <article className={styles.card}>
          <h1 className={styles.title}>Оплата заказа семян онлайн</h1>
          <p className={styles.lead}>
            Заказы оплачиваются онлайн через YooKassa на защищенной платежной странице. На этапе
            оформления оплачивается стоимость товаров, а доставку менеджер согласует отдельно.
          </p>

          <section className={styles.section}>
            <h2>Способы оплаты</h2>
            <ul className={styles.list}>
              <li>Банковская карта на защищенной странице YooKassa.</li>
              <li>ЮMoney и другие способы, если они включены в настройках магазина YooKassa.</li>
              <li>После оплаты YooKassa вернет вас на страницу со статусом заказа.</li>
            </ul>
          </section>

          <div className={styles.actions}>
            <Link href="/checkout" className={styles.btnPrimary}>
              Перейти к оформлению
            </Link>
            <Link href="/delivery" className={styles.btnSecondary}>
              Условия доставки
            </Link>
          </div>
        </article>
      </div>
    </main>
  );
}
