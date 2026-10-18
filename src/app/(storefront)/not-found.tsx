import Link from "next/link";
import styles from "./state-page.module.css";

export default function StorefrontNotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.code}>404</div>
      <div className={styles.content}>
        <p>Кажется, эта грядка пока пустует</p>
        <h1>Страница не найдена</h1>
        <span>Возможно, товар снят с публикации или адрес изменился. Каталог и корзина остались на месте.</span>
        <div className={styles.actions}>
          <Link href="/catalog">Открыть каталог</Link>
          <Link href="/" className={styles.secondary}>На главную</Link>
        </div>
      </div>
    </main>
  );
}
