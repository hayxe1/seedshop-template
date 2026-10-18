import styles from "@/features/home/home.module.css";

type Advantage = {
  icon: string;
  title: string;
  text: string;
};

type AdvantagesSectionProps = {
  advantages: Advantage[];
};

export default function AdvantagesSection({ advantages }: AdvantagesSectionProps) {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <h2>Почему нам доверяют</h2>
          <p>Сервис построен так, чтобы покупка семян была спокойной и предсказуемой.</p>
        </div>

        <div className={styles.advantageGrid}>
          {advantages.map((item) => (
            <article key={item.title} className={styles.advantageCard}>
              <span>{item.icon}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
