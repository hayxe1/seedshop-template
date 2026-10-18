"use client";

import Link from "next/link";
import { useEffect } from "react";
import styles from "./state-page.module.css";

export default function StorefrontError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.page}>
      <div className={styles.code}>!</div>
      <div className={styles.content}>
        <p>Не удалось загрузить данные</p>
        <h1>Что-то пошло не так</h1>
        <span>Корзина сохранена в этом браузере. Попробуйте повторить запрос или вернитесь в каталог.</span>
        <div className={styles.actions}>
          <button type="button" onClick={reset}>Попробовать снова</button>
          <Link href="/catalog" className={styles.secondary}>В каталог</Link>
        </div>
        {error.digest ? <small>Код ошибки: {error.digest}</small> : null}
      </div>
    </main>
  );
}
