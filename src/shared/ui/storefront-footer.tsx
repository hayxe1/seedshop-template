import Link from "next/link";
import styles from "./storefront-footer.module.css";
import { STORE_BRAND } from "@/shared/config/store";

export default function StorefrontFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerInner}`}>
        <div>
          <strong>{STORE_BRAND.name}</strong>
          <p>Тёплый интернет-магазин семян для дачи, теплицы и балкона.</p>
        </div>

        <div className={styles.footerLinks}>
          <Link href="/catalog">Каталог</Link>
          <Link href="/selection">Подбор семян</Link>
          <Link href="/sets">Готовые наборы</Link>
          <Link href="/calendar">Календарь посева</Link>
          <Link href="/delivery">Доставка</Link>
          <Link href="/payment">Оплата</Link>
          <Link href="/contacts">Контакты</Link>
          <Link href="/requisites">Реквизиты</Link>
          <Link href="/offer">Оферта</Link>
          <Link href="/privacy">Политика данных</Link>
        </div>

        <small>© {new Date().getFullYear()} {STORE_BRAND.name}</small>
      </div>
    </footer>
  );
}
