import styles from "./product-page.module.css";

export default function ProductLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.description}>Загрузка карточки товара...</p>
      </section>
    </main>
  );
}
