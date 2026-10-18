import styles from "@/features/home/home.module.css";

type FaqItem = {
  question: string;
  answer: string;
};

type FaqPreviewSectionProps = {
  items: FaqItem[];
};

export default function FaqPreviewSection({ items }: FaqPreviewSectionProps) {
  return (
    <section className={styles.section}>
      <div className={`${styles.container} ${styles.faqPanel}`}>
        <div className={styles.sectionHead}>
          <h2>Частые вопросы</h2>
          <p>Короткие ответы перед заказом.</p>
        </div>

        <div className={styles.faqGrid}>
          {items.map((item, index) => (
            <details key={item.question} className={styles.faqCard} open={index === 0}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
