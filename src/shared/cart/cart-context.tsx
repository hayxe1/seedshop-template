"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import { CHECKOUT_ATTEMPT_STORAGE_KEY, PENDING_ORDER_STORAGE_KEY, readCheckoutAttempt, readPendingOrder, type PurchasedItem } from "./checkout-storage";
import {
  trackCartAdd,
  trackCartRemove,
  type EcommerceProduct,
} from "@/shared/analytics/client";
import {
  cartItemSchema,
  cartQuoteLineSchema,
  parseApiResponse,
  seedSetCartItemProductSchema,
  type CartItemRecord,
  type SeedSetCartItemProduct,
} from "@/shared/api/contracts";

export type CartItem = CartItemRecord;

type ProductCartItemPayload = {
  kind?: "product";
  productId: string;
  slug: string;
  name: string;
  category?: string | undefined;
  price: number;
  imageUrl?: string | undefined;
  quantity?: number | undefined;
  stock?: number | null | undefined;
  inventoryPolicy?: "TRACKED" | "PREORDER" | "UNLIMITED" | undefined;
  sourceSeedSetId?: string | undefined;
  sourceSeedSetName?: string | undefined;
};

type SeedSetCartItemPayload = {
  kind: "seedSet";
  seedSetId: string;
  slug: string;
  name: string;
  price: number;
  imageUrl?: string | undefined;
  quantity?: number | undefined;
  items: SeedSetCartItemProduct[];
};

type AddCartItemPayload = ProductCartItemPayload | SeedSetCartItemPayload;

type CartContextValue = {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
  addItem: (item: AddCartItemPayload) => void;
  addItems: (items: AddCartItemPayload[]) => void;
  updateQuantity: (itemKey: string, quantity: number) => void;
  removeItem: (itemKey: string) => void;
  clearCart: (options?: { trackRemoval?: boolean }) => void;
  completeCheckout: (orderNumber: string, fallback: PurchasedItem[]) => Promise<void>;
  refreshCart: () => Promise<{ ok: boolean; changed: boolean }>;
  cartChecking: boolean;
  cartError: string | null;
  cartNotice: string | null;
  unavailableItems: CartItem[];
};

const STORAGE_KEY = "seed-store-cart-v1";
const MAX_CART_QUANTITY = 99;

const CartContext = createContext<CartContextValue | undefined>(undefined);

const storedCartItemSchema = z.object({
  itemKey: z.string().optional(),
  kind: z.enum(["product", "seedSet"]).optional(),
  productId: z.string().optional(),
  id: z.string().optional(),
  seedSetId: z.string().optional(),
  slug: z.string(),
  name: z.string(),
  category: z.string().optional(),
  price: z.number(),
  imageUrl: z.string().optional(),
  quantity: z.number().optional(),
  stock: z.number().nullable().optional(),
  inventoryPolicy: z.enum(["TRACKED", "PREORDER", "UNLIMITED"]).optional(),
  sourceSeedSetId: z.string().optional(),
  sourceSeedSetName: z.string().optional(),
  items: z.array(seedSetCartItemProductSchema).optional(),
});

function getProductItemKey(productId: string) {
  return `product:${productId}`;
}

function getSeedSetItemKey(seedSetId: string) {
  return `seedSet:${seedSetId}`;
}

function normalizeQuantity(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(MAX_CART_QUANTITY, Math.floor(parsed))
    : 1;
}

function normalizeStock(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeProductPayload(payload: ProductCartItemPayload, quantity: number): CartItem {
  const itemKey = getProductItemKey(payload.productId);
  const stock = normalizeStock(payload.stock);

  return {
    itemKey,
    kind: "product",
    productId: payload.productId,
    slug: payload.slug,
    name: payload.name,
    category: payload.category,
    price: payload.price,
    imageUrl: payload.imageUrl,
    quantity,
    stock,
    inventoryPolicy: payload.inventoryPolicy,
    sourceSeedSetId: payload.sourceSeedSetId,
    sourceSeedSetName: payload.sourceSeedSetName,
  };
}

function toEcommerceProduct(item: CartItem, quantity: number): EcommerceProduct {
  const category = item.kind === "seedSet" ? "Готовые наборы" : item.category;
  return {
    id:
      item.kind === "seedSet"
        ? `seed-set:${item.seedSetId}`
        : item.productId ?? item.itemKey,
    name: item.name,
    ...(category ? { category } : {}),
    price: item.price,
    quantity,
  };
}

function normalizeSeedSetPayload(payload: SeedSetCartItemPayload, quantity: number): CartItem {
  const itemKey = getSeedSetItemKey(payload.seedSetId);

  return {
    itemKey,
    kind: "seedSet",
    seedSetId: payload.seedSetId,
    slug: payload.slug,
    name: payload.name,
    price: payload.price,
    imageUrl: payload.imageUrl,
    quantity,
    stock: null,
    items: payload.items,
  };
}

function normalizePayload(payload: AddCartItemPayload): CartItem {
  const quantity = normalizeQuantity(payload.quantity);

  if (payload.kind === "seedSet") {
    return normalizeSeedSetPayload(payload, quantity);
  }

  return normalizeProductPayload(payload, quantity);
}

function parseStoredCart(raw: string | null) {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const parsedItem = storedCartItemSchema.safeParse(item);
        if (!parsedItem.success) {
          return null;
        }

        const kind = parsedItem.data.kind ?? "product";
        const quantity = normalizeQuantity(parsedItem.data.quantity);

        if (kind === "seedSet") {
          const seedSetId = parsedItem.data.seedSetId ?? "";
          if (!seedSetId) {
            return null;
          }

          const normalized = cartItemSchema.safeParse({
            ...parsedItem.data,
            itemKey: parsedItem.data.itemKey ?? getSeedSetItemKey(seedSetId),
            kind,
            seedSetId,
            quantity,
            stock: null,
            items: parsedItem.data.items ?? [],
          });

          return normalized.success ? normalized.data : null;
        }

        const productId = parsedItem.data.productId ?? parsedItem.data.id ?? "";
        if (!productId) {
          return null;
        }

        const stock = normalizeStock(parsedItem.data.stock);

        const normalized = cartItemSchema.safeParse({
          ...parsedItem.data,
          itemKey: parsedItem.data.itemKey ?? getProductItemKey(productId),
          kind: "product",
          productId,
          quantity,
          stock,
        });

        return normalized.success ? normalized.data : null;
      })
      .filter((item): item is CartItem => Boolean(item));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      return parseStoredCart(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      return [];
    }
  });
  const itemsRef = useRef(items);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = parseStoredCart(event.newValue);
      itemsRef.current = next;
      setItems(next);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const completeCheckout = useCallback(async (orderNumber: string, fallback: PurchasedItem[]) => {
    const complete = () => {
      const pending = readPendingOrder();
      if (pending?.orderNumber !== orderNumber) return;
      let current = itemsRef.current;
      try { current = parseStoredCart(localStorage.getItem(STORAGE_KEY)); } catch { /* Current tab fallback. */ }
      const quantities = new Map((pending.purchasedItems ?? fallback).map(item => [item.itemKey, item.quantity]));
      const next = current.flatMap(item => {
        const quantity = item.quantity - (quantities.get(item.itemKey) ?? 0);
        return quantity > 0 ? [{ ...item, quantity }] : [];
      });
      // Claim completion before another tab can apply the same purchase again.
      try {
        localStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* The current tab remains usable without browser storage. */ }
      itemsRef.current = next;
      setItems(next);
      if (readCheckoutAttempt()?.orderNumber === orderNumber) {
        try { sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY); } catch { /* Optional storage. */ }
      }
    };
    if (navigator.locks) await navigator.locks.request("seedshop-complete-checkout", complete);
    else complete();
  }, []);
  const [cartChecking, setCartChecking] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [unavailableKeys, setUnavailableKeys] = useState<string[]>([]);
  const quoteRequest = useRef(0);
  const refreshCart = useCallback(async () => {
    const snapshot = itemsRef.current;
    if (!snapshot.length) return { ok: true, changed: false };
    const requestId = ++quoteRequest.current;
    setCartChecking(true);
    setCartError(null);
    try {
      const result = await parseApiResponse(await fetch("/api/cart/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: snapshot.map(item => ({ kind: item.kind, id: item.kind === "seedSet" ? item.seedSetId : item.productId })) }),
      }), z.array(cartQuoteLineSchema));
      if (requestId !== quoteRequest.current || itemsRef.current !== snapshot) return { ok: false, changed: false };
      const byKey = new Map(result.data.map(line => [line.itemKey, line.data]));
      const unavailable = snapshot.filter(item => !byKey.get(item.itemKey)).map(item => item.itemKey);
      const next = snapshot.map(item => {
        const data = byKey.get(item.itemKey);
        return data ? { ...item, ...data } : item;
      });
      const changed = JSON.stringify(next) !== JSON.stringify(snapshot);
      setUnavailableKeys(unavailable);
      if (changed) {
        itemsRef.current = next;
        setItems(next);
        setCartNotice("Цены, наличие или состав товаров обновились. Проверьте заказ перед оформлением.");
      }
      return { ok: unavailable.length === 0, changed };
    } catch (error) {
      if (requestId === quoteRequest.current) setCartError(error instanceof Error ? error.message : "Не удалось проверить корзину.");
      return { ok: false, changed: false };
    } finally {
      if (requestId === quoteRequest.current) setCartChecking(false);
    }
  }, []);
  const unavailableItems = useMemo(() => items.filter(item => unavailableKeys.includes(item.itemKey)), [items, unavailableKeys]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The cart remains usable for the current tab when storage is unavailable or full.
    }
  }, [items]);

  const addItems = useCallback((payloads: AddCartItemPayload[]) => {
    let nextItems = itemsRef.current;
    const additions: EcommerceProduct[] = [];

    for (const payload of payloads) {
      const normalizedPayload = normalizePayload(payload);
      const existing = nextItems.find((item) => item.itemKey === normalizedPayload.itemKey);

      if (existing) {
        const stock =
          normalizedPayload.kind === "product"
            ? normalizedPayload.stock ?? existing.stock ?? null
            : null;
        const quantity = Math.min(
          existing.quantity + normalizedPayload.quantity,
          MAX_CART_QUANTITY
        );
        const updatedItem: CartItem = {
          ...existing,
          ...normalizedPayload,
          sourceSeedSetId: normalizedPayload.sourceSeedSetId ?? existing.sourceSeedSetId,
          sourceSeedSetName: normalizedPayload.sourceSeedSetName ?? existing.sourceSeedSetName,
          quantity,
          stock,
          inventoryPolicy: normalizedPayload.inventoryPolicy ?? existing.inventoryPolicy,
          items:
            normalizedPayload.kind === "seedSet"
              ? normalizedPayload.items ?? existing.items
              : existing.items,
        };
        nextItems = nextItems.map((item) =>
          item.itemKey === normalizedPayload.itemKey ? updatedItem : item
        );
        if (quantity > existing.quantity) {
          additions.push(toEcommerceProduct(updatedItem, quantity - existing.quantity));
        }
        continue;
      }

      nextItems = [...nextItems, normalizedPayload];
      additions.push(toEcommerceProduct(normalizedPayload, normalizedPayload.quantity));
    }

    if (nextItems === itemsRef.current) return;
    itemsRef.current = nextItems;
    setItems(nextItems);
    additions.forEach((product) => trackCartAdd(product, product.quantity ?? 1));
  }, []);

  const addItem = useCallback(
    (payload: AddCartItemPayload) => {
      addItems([payload]);
    },
    [addItems]
  );

  const updateQuantity = useCallback((itemKey: string, quantity: number) => {
    const currentItems = itemsRef.current;
    const existing = currentItems.find((item) => item.itemKey === itemKey);
    if (!existing) return;

    if (quantity <= 0) {
      const nextItems = currentItems.filter((item) => item.itemKey !== itemKey);
      itemsRef.current = nextItems;
      setItems(nextItems);
      trackCartRemove(toEcommerceProduct(existing, existing.quantity), existing.quantity);
      return;
    }

    if (!Number.isFinite(quantity)) return;
    const nextQuantity = Math.max(1, Math.min(Math.floor(quantity), MAX_CART_QUANTITY));
    if (nextQuantity === existing.quantity) return;

    const updatedItem = { ...existing, quantity: nextQuantity };
    const nextItems = currentItems.map((item) =>
      item.itemKey === itemKey ? updatedItem : item
    );
    itemsRef.current = nextItems;
    setItems(nextItems);

    const difference = nextQuantity - existing.quantity;
    if (difference > 0) {
      trackCartAdd(toEcommerceProduct(updatedItem, difference), difference);
    } else {
      trackCartRemove(toEcommerceProduct(updatedItem, -difference), -difference);
    }
  }, []);

  const removeItem = useCallback((itemKey: string) => {
    const currentItems = itemsRef.current;
    const existing = currentItems.find((item) => item.itemKey === itemKey);
    if (!existing) return;

    const nextItems = currentItems.filter((item) => item.itemKey !== itemKey);
    itemsRef.current = nextItems;
    setItems(nextItems);
    trackCartRemove(toEcommerceProduct(existing, existing.quantity), existing.quantity);
  }, []);

  const clearCart = useCallback((options?: { trackRemoval?: boolean }) => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) return;

    itemsRef.current = [];
    setItems([]);
    if (options?.trackRemoval !== false) {
      currentItems.forEach((item) =>
        trackCartRemove(toEcommerceProduct(item, item.quantity), item.quantity)
      );
    }
  }, []);

  const totalItems = useMemo(
    () => items.reduce((accumulator, item) => accumulator + item.quantity, 0),
    [items]
  );

  const totalPrice = useMemo(
    () => items.reduce((accumulator, item) => accumulator + item.price * item.quantity, 0),
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      totalItems,
      totalPrice,
      addItem,
      addItems,
      updateQuantity,
      removeItem,
      clearCart,
      completeCheckout,
      refreshCart, cartChecking, cartError, cartNotice, unavailableItems,
    }),
    [items, totalItems, totalPrice, addItem, addItems, updateQuantity, removeItem, clearCart, completeCheckout,
      refreshCart, cartChecking, cartError, cartNotice, unavailableItems]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
