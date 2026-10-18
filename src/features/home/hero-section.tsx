import Image from "next/image";
import Link from "next/link";
import styles from "@/features/home/home.module.css";

export default function HeroSection() {
  return (
    <section className={styles.heroSection} aria-labelledby="home-hero-title">
      <div className={styles.container}>
        <div className={styles.heroMedia}>
          <Image
            src="/home/hero-garden.webp"
            alt="Ухоженные грядки с овощами и зеленью"
            fill
            priority
            unoptimized
            className={styles.heroImage}
            sizes="(max-width: 640px) 100vw, 1220px"
          />
          <div className={styles.heroOverlay} />
          <div className={styles.heroContent}>
            <h1 id="home-hero-title" className={styles.heroTitle}>
              Купить семена для дачи, теплицы и балкона
            </h1>
            <p className={styles.heroSubtitle}>
              Семена овощей, зелени и цветов с понятными характеристиками. Заказ без
              регистрации, бесплатный самовывоз и доставка по Воронежу.
            </p>
            <div className={styles.heroActions}>
              <Link href="/catalog" className={styles.primaryButton}>
                Выбрать семена
              </Link>
              <Link href="/sets" className={styles.heroSecondaryButton}>
                Готовые наборы
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
