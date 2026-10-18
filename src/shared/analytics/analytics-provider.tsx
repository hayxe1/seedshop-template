"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useSyncExternalStore } from "react";
import {
  getMetricaId,
  getServerAnalyticsConsent,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  subscribeAnalyticsConsent,
  type AnalyticsConsent,
} from "./client";
import styles from "./analytics-provider.module.css";

function initializeMetrica(metricaId: number) {
  if (typeof window.ym !== "function") {
    const queue = Object.assign(
      function (...args: unknown[]) {
        queue.a.push(args);
      },
      { a: [] as unknown[][], l: Date.now() }
    );
    window.ym = queue;
  }

  window.__seedshopTemplateMetricaInitialized =
    window.__seedshopTemplateMetricaInitialized ?? {};
  if (window.__seedshopTemplateMetricaInitialized[metricaId]) return;

  window.ym?.(metricaId, "init", {
    ssr: true,
    defer: true,
    accurateTrackBounce: true,
    clickmap: true,
    ecommerce: "dataLayer",
    trackLinks: true,
    webvisor: false,
  });
  window.__seedshopTemplateMetricaInitialized[metricaId] = true;
}

function AnalyticsProviderInner({ metricaId }: { metricaId: string }) {
  const numericMetricaId = /^\d+$/.test(metricaId) ? Number(metricaId) : null;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const consent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    readAnalyticsConsent,
    getServerAnalyticsConsent
  );

  useEffect(() => {
    if (consent !== "accepted" || !numericMetricaId) return;

    window.dataLayer = window.dataLayer ?? [];
    initializeMetrica(numericMetricaId);

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[data-seedshop-template-metrica="${numericMetricaId}"]`
    );

    if (existingScript) return;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://mc.yandex.ru/metrika/tag.js?id=${numericMetricaId}`;
    script.dataset.seedshopTemplateMetrica = String(numericMetricaId);
    document.head.appendChild(script);
  }, [consent, numericMetricaId]);

  useEffect(() => {
    if (consent !== "accepted" || !numericMetricaId || !getMetricaId()) return;

    initializeMetrica(numericMetricaId);
    window.__seedshopTemplateMetricaLastHit = window.__seedshopTemplateMetricaLastHit ?? {};

    const currentUrl = window.location.href;
    const previousUrl = window.__seedshopTemplateMetricaLastHit[numericMetricaId];
    if (previousUrl === currentUrl) return;

    window.ym?.(numericMetricaId, "hit", currentUrl, {
      title: document.title,
      referer: previousUrl ?? document.referrer,
    });
    window.__seedshopTemplateMetricaLastHit[numericMetricaId] = currentUrl;
  }, [consent, numericMetricaId, pathname, searchParams]);

  if (!numericMetricaId || consent !== "unknown") return null;

  const saveConsent = (nextConsent: Exclude<AnalyticsConsent, "unknown">) =>
    saveAnalyticsConsent(nextConsent);

  return (
    <aside className={styles.banner} aria-label="Настройка аналитики">
      <div>
        <strong>Поможете сделать магазин удобнее?</strong>
        <p>
          С вашего согласия мы включим обезличенную статистику посещений. Без
          согласия магазин работает как обычно. Подробнее — в{" "}
          <Link href="/privacy">политике конфиденциальности</Link>.
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={() => saveConsent("declined")}>
          Только необходимые
        </button>
        <button
          type="button"
          className={styles.accept}
          onClick={() => saveConsent("accepted")}
        >
          Разрешить аналитику
        </button>
      </div>
    </aside>
  );
}

export function AnalyticsProvider({ metricaId }: { metricaId: string }) {
  return (
    <Suspense fallback={null}>
      <AnalyticsProviderInner metricaId={metricaId} />
    </Suspense>
  );
}
