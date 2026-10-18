"use client";

export const ANALYTICS_CONSENT_KEY = "seedshop-template-analytics-consent-v1";
const ANALYTICS_CONSENT_EVENT = "seedshop-template:analytics-consent";

export type AnalyticsConsent = "accepted" | "declined" | "unknown";

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export type EcommerceProduct = {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  category?: string;
};

type EcommercePayload = {
  ecommerce: {
    currencyCode: "RUB";
    detail?: { products: EcommerceProduct[] };
    add?: { products: EcommerceProduct[] };
    remove?: { products: EcommerceProduct[] };
    purchase?: {
      actionField: { id: string; revenue: number };
      products: EcommerceProduct[];
    };
  };
};

const PURCHASES_STORAGE_KEY = "seedshop-template-ecommerce-purchases-v1";
const sentPurchases = new Set<string>();
let lastDetail: { key: string; timestamp: number } | null = null;

declare global {
  interface Window {
    ym?: {
      (...args: unknown[]): void;
      a?: unknown[][];
      l?: number;
    };
    dataLayer?: EcommercePayload[];
    __seedshopTemplateMetricaInitialized?: Record<number, boolean>;
    __seedshopTemplateMetricaLastHit?: Record<number, string>;
  }
}

function hasAnalyticsConsent() {
  return readAnalyticsConsent() === "accepted";
}

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return "unknown";

  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === "accepted" || value === "declined" ? value : "unknown";
  } catch {
    return "declined";
  }
}

export function getServerAnalyticsConsent(): AnalyticsConsent {
  return "unknown";
}

export function subscribeAnalyticsConsent(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === ANALYTICS_CONSENT_KEY) onStoreChange();
  };
  const handleConsent = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
  };
}

export function saveAnalyticsConsent(
  value: Exclude<AnalyticsConsent, "unknown">
) {
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
}

export function getMetricaId() {
  const value = process.env.NEXT_PUBLIC_YANDEX_METRICA_ID?.trim();
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function normalizeProduct(product: EcommerceProduct): EcommerceProduct | null {
  const id = product.id.trim();
  const name = product.name.trim();
  const price = Number(product.price);
  const quantity = product.quantity === undefined ? undefined : Math.floor(product.quantity);

  if (!id || !name || !Number.isFinite(price) || price < 0) return null;
  if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) return null;

  return {
    id,
    name,
    price,
    ...(quantity === undefined ? {} : { quantity }),
    ...(product.category?.trim() ? { category: product.category.trim() } : {}),
  };
}

function pushEcommerce(payload: EcommercePayload) {
  if (typeof window === "undefined" || !hasAnalyticsConsent() || !getMetricaId()) {
    return false;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(payload);
  return true;
}

function productAction(
  action: "detail" | "add" | "remove",
  product: EcommerceProduct
) {
  const normalized = normalizeProduct(product);
  if (!normalized) return false;

  return pushEcommerce({
    ecommerce: {
      currencyCode: "RUB",
      [action]: { products: [normalized] },
    },
  });
}

export function trackProductDetail(product: EcommerceProduct) {
  if (typeof window === "undefined") return false;

  const key = `${window.location.pathname}:${product.id}`;
  const now = Date.now();
  if (lastDetail?.key === key && now - lastDetail.timestamp < 1_000) return false;

  const sent = productAction("detail", { ...product, quantity: 1 });
  if (sent) lastDetail = { key, timestamp: now };
  return sent;
}

export function trackCartAdd(product: EcommerceProduct, quantity: number) {
  return productAction("add", { ...product, quantity });
}

export function trackCartRemove(product: EcommerceProduct, quantity: number) {
  return productAction("remove", { ...product, quantity });
}

function readSentPurchases() {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(PURCHASES_STORAGE_KEY) ?? "[]");
    return Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function trackPurchase({
  orderId,
  revenue,
  products,
}: {
  orderId: string;
  revenue: number;
  products: EcommerceProduct[];
}) {
  if (typeof window === "undefined") return false;

  const normalizedOrderId = orderId.trim();
  const normalizedProducts = products
    .map(normalizeProduct)
    .filter((product): product is EcommerceProduct => product !== null);
  const storedPurchases = readSentPurchases();

  if (
    !normalizedOrderId ||
    !Number.isFinite(revenue) ||
    revenue < 0 ||
    normalizedProducts.length === 0 ||
    sentPurchases.has(normalizedOrderId) ||
    storedPurchases.includes(normalizedOrderId)
  ) {
    return false;
  }

  const sent = pushEcommerce({
    ecommerce: {
      currencyCode: "RUB",
      purchase: {
        actionField: { id: normalizedOrderId, revenue },
        products: normalizedProducts,
      },
    },
  });

  if (!sent) return false;

  sentPurchases.add(normalizedOrderId);
  try {
    window.localStorage.setItem(
      PURCHASES_STORAGE_KEY,
      JSON.stringify([...storedPurchases, normalizedOrderId].slice(-100))
    );
  } catch {
    // The in-memory marker still prevents duplicates during this page session.
  }
  return true;
}

function toGoalName(eventName: string) {
  return eventName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function track(eventName: string, properties: AnalyticsProperties = {}) {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return;

  const metricaId = getMetricaId();
  if (!metricaId || typeof window.ym !== "function") return;

  window.ym(metricaId, "reachGoal", toGoalName(eventName), properties);
}
