"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getCatalogReturnHref } from "@/shared/lib/catalog-return";

const positionKey = "seedshop-catalog-position:v1";
const pendingKey = "seedshop-catalog-return:v1";

export function CatalogProductLink({ href, returnTo, slug, className, children }: {
  href: string; returnTo?: string | undefined; slug: string; className?: string | undefined; children: ReactNode;
}) {
  return <Link href={href} className={className} prefetch={false} onClick={event => {
    if (!returnTo || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const card = event.currentTarget.closest("article");
    try { sessionStorage.setItem(positionKey, JSON.stringify({ href: returnTo, slug, offset: card?.getBoundingClientRect().top ?? 0, y: scrollY, savedAt: Date.now() })); } catch { /* Navigation also works without optional storage. */ }
  }}>{children}</Link>;
}

export function CatalogReturnLink({ href, className }: { href: string; className?: string | undefined }) {
  return <Link href={href} className={className} onClick={() => {
    try { sessionStorage.setItem(pendingKey, href); } catch { /* Normal link remains available. */ }
  }}>← Вернуться к результатам</Link>;
}

export function CatalogPositionRestorer() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    let frame = 0;
    try {
      const href = pathname + (search ? `?${search}` : "");
      if (sessionStorage.getItem(pendingKey) !== href) return;
      const position = JSON.parse(sessionStorage.getItem(positionKey) ?? "null");
      if (!position || getCatalogReturnHref(position.href) !== href || typeof position.slug !== "string" ||
          !Number.isFinite(position.y) || !Number.isFinite(position.offset) ||
          !Number.isFinite(position.savedAt) || Date.now() - position.savedAt > 30 * 60_000) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const card = [...document.querySelectorAll<HTMLElement>("article[data-product-slug]")].find(el => el.dataset.productSlug === position.slug);
          try { sessionStorage.removeItem(pendingKey); } catch { /* Optional storage. */ }
          window.scrollTo({ top: Math.max(0, card ? scrollY + card.getBoundingClientRect().top - position.offset : position.y), behavior: "instant" });
        });
      });
    } catch { /* Expired or unavailable session storage does not affect the catalog. */ }
    return () => cancelAnimationFrame(frame);
  }, [pathname, search]);
  return null;
}
