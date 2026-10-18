import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { findOrderByAccessToken } from "@/server/commerce/order-view";
import styles from "../../content-page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Статус оплаты",
  description: "Статус оплаты заказа через YooKassa.",
};

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const token = ((await searchParams)?.token ?? "").trim();
  const order = token ? await findOrderByAccessToken(token) : null;

  if (order) {
    redirect(`/order/${encodeURIComponent(token)}?payment=return`);
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <article className={styles.card}>
          <h1 className={styles.title}>Заказ не найден</h1>
          <p className={styles.lead}>
            Ссылка могла устареть. Проверьте её или свяжитесь с магазином — мы найдём заказ по телефону.
          </p>
          <div className={styles.actions}>
            <Link href="/contacts" className={styles.btnPrimary}>Связаться с нами</Link>
            <Link href="/catalog" className={styles.btnSecondary}>Вернуться в каталог</Link>
          </div>
        </article>
      </div>
    </main>
  );
}
