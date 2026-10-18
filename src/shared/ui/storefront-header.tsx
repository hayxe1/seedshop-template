"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { StorefrontHeaderActions, StorefrontHeaderNav } from "./storefront-header-nav";
import CatalogSearchBox from "./catalog-search-box";
import styles from "./storefront-header.module.css";
import { STORE_BRAND } from "@/shared/config/store";

export default function StorefrontHeader() {
  const pathname = usePathname();
  const [openPanel, setOpenPanel] = useState<{
    kind: "menu" | "search";
    pathname: string;
  } | null>(null);
  const menuOpen = openPanel?.pathname === pathname && openPanel.kind === "menu";
  const searchOpen = openPanel?.pathname === pathname && openPanel.kind === "search";

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.inner}>
          <Link href="/" className={styles.logo} aria-label={STORE_BRAND.name}>
            <span className={styles.logoWordStart}>{STORE_BRAND.logoStart}&nbsp;</span>
            <span className={styles.logoWordGarden}>{STORE_BRAND.logoEnd}</span>
          </Link>

          <StorefrontHeaderNav />

          <CatalogSearchBox id="global-catalog-search" className={styles.searchForm} />

          <div className={styles.mobileControls}>
            <button
              type="button"
              onClick={() => {
                setOpenPanel((current) =>
                  current?.pathname === pathname && current.kind === "search"
                    ? null
                    : { kind: "search", pathname }
                );
              }}
              aria-expanded={searchOpen}
              aria-controls="mobile-search-panel"
              aria-label={searchOpen ? "Закрыть поиск" : "Открыть поиск"}
            >
              <svg className={styles.mobileControlIcon} viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <span className={styles.mobileControlLabel} aria-hidden="true">Поиск</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenPanel((current) =>
                  current?.pathname === pathname && current.kind === "menu"
                    ? null
                    : { kind: "menu", pathname }
                );
              }}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu-panel"
              aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            >
              <svg className={styles.mobileControlIcon} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              <span className={styles.mobileControlLabel} aria-hidden="true">Меню</span>
            </button>
          </div>

          <StorefrontHeaderActions />
        </div>
        {searchOpen ? (
          <div id="mobile-search-panel" className={styles.mobilePanel}>
            <CatalogSearchBox id="mobile-catalog-search" className={styles.mobileSearchForm} autoFocus />
          </div>
        ) : null}
        {menuOpen ? (
          <div id="mobile-menu-panel" className={`${styles.mobilePanel} ${styles.mobileMenuPanel}`}>
            <StorefrontHeaderNav />
            <Link href="/faq" className={styles.mobileFaqLink}>Частые вопросы</Link>
          </div>
        ) : null}
      </div>
    </header>
  );
}
