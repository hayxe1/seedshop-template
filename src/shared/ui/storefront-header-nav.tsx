"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import CartLinkButton from "@/features/cart/cart-link-button";
import styles from "./storefront-header.module.css";

type HeaderSection = "catalog" | "selection" | "sets" | "calendar" | "delivery" | "contacts";

const navItems: Array<{ id: HeaderSection; href: string; label: string }> = [
  { id: "catalog", href: "/catalog", label: "Каталог" },
  { id: "selection", href: "/selection", label: "Подбор" },
  { id: "sets", href: "/sets", label: "Наборы" },
  { id: "calendar", href: "/calendar", label: "Календарь" },
  { id: "delivery", href: "/delivery", label: "Доставка" },
  { id: "contacts", href: "/contacts", label: "Контакты" },
];

function isActiveSection(pathname: string, item: { id: HeaderSection; href: string }) {
  if (item.id === "catalog") {
    return pathname === "/catalog" || pathname.startsWith("/catalog/") || pathname.startsWith("/product/");
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function StorefrontHeaderNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Основная навигация магазина">
      {navItems.map((item) => {
        const isActive = isActiveSection(pathname, item);
        const className = isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink;

        return (
          <Link
            key={item.id}
            href={item.href}
            className={className}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function StorefrontHeaderActions() {
  const pathname = usePathname();
  const isFaqActive = pathname === "/faq" || pathname.startsWith("/faq/");

  return (
    <div className={styles.actions}>
      <Link
        href="/faq"
        className={isFaqActive ? `${styles.faqLink} ${styles.faqLinkActive}` : styles.faqLink}
        aria-current={isFaqActive ? "page" : undefined}
      >
        F.A.Q
      </Link>
      <CartLinkButton className={styles.cartButton} />
    </div>
  );
}
