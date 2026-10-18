import Link from "next/link";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";
import styles from "../content-page.module.css";

export const metadata: Metadata = createPageMetadata({
  title: "Вопросы о выборе, заказе и доставке семян",
  description:
    "Ответы на частые вопросы о выборе семян, сроках посева, заказе без регистрации, оплате, бесплатном самовывозе и доставке по Воронежу.",
  path: "/faq",
});

const faqItems = [
  {
    question: "Можно ли оформить заказ без регистрации?",
    answer: "Да, это стандартный сценарий: личный кабинет для покупки не нужен.",
  },
  {
    question: "Как выбрать семена новичку?",
    answer:
      "Откройте быстрый подбор: он учтёт место выращивания, ваш опыт и месяц посева.",
  },
  {
    question: "Когда сеять, пересаживать и собирать урожай?",
    answer:
      "Смотрите три режима календаря и месяцы в карточке товара. Учитывайте климат своего региона и погоду.",
  },
  {
    question: "Есть ли минимальная сумма заказа?",
    answer: "Нет, сейчас минимальной суммы заказа нет.",
  },
  {
    question: "Можно ли забрать заказ самовывозом?",
    answer:
      "Да, самовывоз в Воронеже бесплатный. Точное место и время менеджер сообщит после оформления.",
  },
  {
    question: "Куда доставляете?",
    answer:
      "Сейчас доставляем только по Воронежу. Стоимость менеджер согласует отдельно до доставки.",
  },
  {
    question: "Что оплачивается на сайте?",
    answer:
      "Товары и выбранная подарочная упаковка. Самовывоз бесплатный, городская доставка оплачивается отдельно.",
  },
];

export default function FaqPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />
      <div className={styles.container}>
        <article className={styles.card}>
          <h1 className={styles.title}>Вопросы о выборе и заказе семян</h1>
          <p className={styles.lead}>Короткие ответы о подборе, оплате, самовывозе и доставке.</p>

          <section className={styles.section}>
            <h2>Частые вопросы</h2>
            <ul className={styles.list}>
              {faqItems.map((item) => (
                <li key={item.question}>
                  <strong>{item.question}</strong> {item.answer}
                </li>
              ))}
            </ul>
          </section>

          <div className={styles.actions}>
            <Link href="/catalog" className={styles.btnPrimary}>
              Перейти к товарам
            </Link>
            <Link href="/contacts" className={styles.btnSecondary}>
              Задать вопрос
            </Link>
          </div>
        </article>
      </div>
    </main>
  );
}
