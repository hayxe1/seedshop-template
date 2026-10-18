"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { AdminNotification } from "./admin-notifications";
import styles from "./admin-shell.module.css";
import { STORE_BRAND } from "@/shared/config/store";
import { confirmAdminNavigation } from "@/shared/hooks/use-unsaved-changes";

type AdminShellAction = {
  href: string;
  label: string;
  placement?: "header" | "topbar";
  testId?: string;
};

type AdminShellSearch = {
  mode?: "global" | "catalog";
  placeholder?: string;
  label?: string;
  paramName?: string;
};

type AdminShellProps = {
  title: string;
  subtitle?: string;
  primaryAction?: AdminShellAction;
  secondaryActions?: AdminShellAction[];
  search?: AdminShellSearch;
  notifications?: AdminNotification[];
  hidePageHeader?: boolean;
  compactContent?: boolean;
  children: ReactNode;
};

type IconName = "overview" | "orders" | "catalog" | "store" | "logout" | "search" | "bell" | "plus";

const navItems: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Обзор", icon: "overview" },
  { href: "/admin/orders", label: "Заказы", icon: "orders" },
  { href: "/admin/catalog", label: "Каталог товаров", icon: "catalog" },
];

function Icon({ name }: { name: IconName }) {
  if (name === "overview") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 4h7v7H4z" />
        <path d="M13 4h7v7h-7z" />
        <path d="M4 13h7v7H4z" />
        <path d="M13 13h7v7h-7z" />
      </svg>
    );
  }

  if (name === "orders") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 6h14l-2 8H9z" />
        <path d="M7 6 6 3H3" />
        <path d="M9 19.5h.01" />
        <path d="M18 19.5h.01" />
      </svg>
    );
  }

  if (name === "catalog") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 4c2.8 2.1 4.2 4.5 4.2 7.1 0 2.4-1.9 4.3-4.2 4.3s-4.2-1.9-4.2-4.3C7.8 8.5 9.2 6.1 12 4Z" />
        <path d="M12 15.4V21" />
        <path d="M7 18h10" />
      </svg>
    );
  }

  if (name === "store") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m10 18-6-6 6-6" />
        <path d="M4 12h16" />
      </svg>
    );
  }

  if (name === "logout") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
        <path d="M10 12h10" />
        <path d="m17 9 3 3-3 3" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m20 20-4.4-4.4" />
        <circle cx="11" cy="11" r="6" />
      </svg>
    );
  }

  if (name === "bell") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function getActiveNotificationCount(notifications: AdminNotification[]) {
  return notifications.reduce((total, item) => total + Math.max(0, item.count), 0);
}

type AdminSearchFieldProps = {
  mode: "global" | "catalog";
  initialValue: string;
  placeholder: string;
  label: string;
  onApply: (value: string) => void;
};

function AdminSearchField({
  mode,
  initialValue,
  placeholder,
  label,
  onApply,
}: AdminSearchFieldProps) {
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    if (mode !== "catalog" || draft === initialValue) {
      return;
    }

    const timeoutId = window.setTimeout(() => onApply(draft), 260);
    return () => window.clearTimeout(timeoutId);
  }, [draft, initialValue, mode, onApply]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply(draft);
  };

  return (
    <form
      className={`${styles.search} ${mode === "catalog" ? styles.searchActive : ""}`.trim()}
      role="search"
      aria-label={label}
      onSubmit={submit}
    >
      <Icon name="search" />
      <input
        type="search"
        placeholder={placeholder}
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => {
          if (mode === "global" && draft === initialValue) {
            setDraft("");
          }
        }}
      />
    </form>
  );
}

export default function AdminShell({
  title,
  subtitle,
  primaryAction,
  secondaryActions = [],
  search,
  notifications = [],
  hidePageHeader = false,
  compactContent = false,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCatalogSearch = search?.mode === "catalog";
  const searchParamName = search?.paramName ?? "q";
  const searchValueFromUrl = isCatalogSearch ? searchParams.get(searchParamName) ?? "" : "";
  const activeNotificationCount = getActiveNotificationCount(notifications);
  const activeNotifications = notifications.filter((item) => item.count > 0);
  const primaryActionPlacement = primaryAction?.placement ?? "header";
  const topbarSecondaryActions = secondaryActions.filter(
    (action) => (action.placement ?? "topbar") === "topbar"
  );
  const headerSecondaryActions = secondaryActions.filter((action) => action.placement === "header");

  const applyCatalogSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextValue = value.trim();

      if (nextValue) {
        params.set(searchParamName, nextValue);
      } else {
        params.delete(searchParamName);
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParamName, searchParams]
  );

  const applySearch = useCallback((value: string) => {
    if (isCatalogSearch) {
      applyCatalogSearch(value);
      return;
    }

    const nextValue = value.trim();
    if (nextValue) {
      if (!confirmAdminNavigation()) return;
      const params = new URLSearchParams({ tab: "products", q: nextValue });
      router.push(`/admin/catalog?${params.toString()}`);
    }
  }, [applyCatalogSearch, isCatalogSearch, router]);

  const handleLogout = async () => {
    if (!confirmAdminNavigation()) return;
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Link href="/admin" className={styles.logo} aria-label={STORE_BRAND.name}>
            <span>{STORE_BRAND.logoStart}</span>
            <span>{STORE_BRAND.logoEnd}</span>
          </Link>
          <p>Админ-панель</p>
        </div>

        <nav className={styles.nav} aria-label="Навигация админки">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`.trim()}
              >
                <Icon name={item.icon} />
                <span className={styles.desktopNavLabel}>{item.label}</span>
                <span className={styles.mobileNavLabel}>{item.href === "/admin/catalog" ? "Каталог" : item.label}</span>
              </Link>
            );
          })}
          <Link href="/" className={`${styles.navLink} ${styles.storeLink}`}>
            <Icon name="store" />
            <span>Вернуться в магазин</span>
          </Link>
        </nav>

        <div className={styles.sidebarFooter}>
          <Link href="/" className={`${styles.navLink} ${styles.mobileStoreLink}`}>
            <Icon name="store" />
            <span>В магазин</span>
          </Link>
          <button type="button" className={styles.logoutButton} onClick={handleLogout}>
            <Icon name="logout" />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <AdminSearchField
            key={
              isCatalogSearch
                ? `${pathname}:${searchParamName}:${searchValueFromUrl}`
                : `global:${pathname}`
            }
            mode={isCatalogSearch ? "catalog" : "global"}
            initialValue={searchValueFromUrl}
            placeholder={search?.placeholder ?? "Найти товар, заказ или клиента"}
            label={search?.label ?? "Поиск по товарам и заказам"}
            onApply={applySearch}
          />

          {primaryActionPlacement === "topbar" || topbarSecondaryActions.length > 0 ? (
            <div className={styles.topbarActions}>
              {primaryAction && primaryActionPlacement === "topbar" ? (
                <Link className={styles.primaryAction} href={primaryAction.href} data-testid={primaryAction.testId}>
                  <Icon name="plus" />
                  <span>{primaryAction.label}</span>
                </Link>
              ) : null}
              {topbarSecondaryActions.map((action) => (
                <Link
                  key={`${action.href}-${action.label}`}
                  className={styles.secondaryTopbarAction}
                  href={action.href}
                  data-testid={action.testId}
                >
                  <Icon name="plus" />
                  <span>{action.label}</span>
                </Link>
              ))}
            </div>
          ) : null}

          <details className={styles.notifications}>
            <summary aria-label="Уведомления">
              <Icon name="bell" />
              {activeNotificationCount > 0 ? (
                <span className={styles.notificationBadge}>
                  {activeNotificationCount > 99 ? "99+" : activeNotificationCount}
                </span>
              ) : null}
            </summary>
            <div className={styles.notificationPanel}>
              <div className={styles.notificationHeader}>
                <strong>Уведомления</strong>
                <span>{activeNotificationCount > 0 ? activeNotificationCount : "0"}</span>
              </div>
              {activeNotifications.length > 0 ? (
                <ul>
                  {activeNotifications.map((item) => (
                    <li key={item.id} className={styles[`notification${item.tone}`]}>
                      <Link href={item.href}>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.text}</small>
                        </span>
                        <b>{item.count.toLocaleString("ru-RU")}</b>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Новых уведомлений нет.</p>
              )}
            </div>
          </details>
        </header>

        <div className={`${styles.content} ${compactContent ? styles.contentCompact : ""}`.trim()}>
          {!hidePageHeader ? (
            <div className={styles.pageHeader}>
              <div>
                <h1>{title}</h1>
                {subtitle ? <p>{subtitle}</p> : null}
              </div>
              {(primaryAction && primaryActionPlacement === "header") || headerSecondaryActions.length > 0 ? (
                <div className={styles.pageHeaderActions}>
                  {headerSecondaryActions.map((action) => (
                    <Link
                      key={`${action.href}-${action.label}`}
                      className={styles.secondaryTopbarAction}
                      href={action.href}
                      data-testid={action.testId}
                    >
                      <Icon name="plus" />
                      <span>{action.label}</span>
                    </Link>
                  ))}
                  {primaryAction && primaryActionPlacement === "header" ? (
                    <Link className={styles.primaryAction} href={primaryAction.href} data-testid={primaryAction.testId}>
                      <Icon name="plus" />
                      <span>{primaryAction.label}</span>
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {children}
        </div>
      </section>
    </main>
  );
}
