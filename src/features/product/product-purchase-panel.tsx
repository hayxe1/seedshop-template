"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { InventoryPolicy } from "@prisma/client";
import { trackProductDetail } from "@/shared/analytics/client";
import { useCart } from "@/shared/cart/cart-context";
import Link from "next/link";
import styles from "./product-purchase-panel.module.css";

const quantityPresets = [5, 10, 20];
const MAX_QUANTITY = 99;
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

type ProductPurchasePanelProps = {
  product: {
    productId: string;
    slug: string;
    name: string;
    category: string;
    price: number;
    imageUrl: string;
    stock: number | null;
    inventoryPolicy: InventoryPolicy;
    isAvailable: boolean;
    packLabel: string;
  };
};

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export default function ProductPurchasePanel({ product }: ProductPurchasePanelProps) {
  const { addItem } = useCart();
  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  const [quantity, setQuantity] = useState(1);
  const [quantityDraft, setQuantityDraft] = useState("1");
  const [added, setAdded] = useState(false);
  const maximum = MAX_QUANTITY;
  const isPreorder = product.inventoryPolicy === "PREORDER" ||
    (product.inventoryPolicy === "TRACKED" && quantity > (product.stock ?? 0));
  const total = useMemo(() => product.price * quantity, [product.price, quantity]);

  useEffect(() => {
    trackProductDetail({
      id: product.productId,
      name: product.name,
      category: product.category,
      price: product.price,
    });
  }, [product.category, product.name, product.price, product.productId]);

  const setSafeQuantity = (value: number) => {
    const next = Number.isFinite(value) ? Math.floor(value) : 1;
    const safe = Math.min(Math.max(1, next), Math.max(1, maximum));
    setQuantity(safe);
    setQuantityDraft(String(safe));
    setAdded(false);
    return safe;
  };

  const commitQuantity = () => setSafeQuantity(quantityDraft.trim() ? Number(quantityDraft) : quantity);

  const handleAdd = () => {
    if (!product.isAvailable) return;
    const confirmedQuantity = commitQuantity();
    addItem({
      productId: product.productId,
      slug: product.slug,
      name: product.name,
      category: product.category,
      price: product.price,
      imageUrl: product.imageUrl,
      stock: product.inventoryPolicy === "TRACKED" ? product.stock ?? 0 : null,
      inventoryPolicy: product.inventoryPolicy,
      quantity: confirmedQuantity,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className={styles.wrap}>
      <div className={product.isAvailable ? styles.availability : styles.unavailable} role="status">
        <span aria-hidden="true" />
        {product.isAvailable
          ? isPreorder
            ? "Доступно под заказ"
            : "Можно добавить в заказ"
          : "Сейчас нет в наличии"}
      </div>

      {product.isAvailable ? (
        <>
          <div className={styles.quantityRow}>
            <span className={styles.label}>Количество единиц</span>
            <div className={styles.controls}>
              <button type="button" onClick={() => setSafeQuantity(quantity - 1)} disabled={!isClient || quantity <= 1} aria-label="Уменьшить количество">−</button>
              <input
                type="number"
                min="1"
                max={maximum}
                inputMode="numeric"
                value={quantityDraft}
                disabled={!isClient}
                onChange={(event) => {
                  setQuantityDraft(event.target.value);
                  setAdded(false);
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 1 && value <= maximum) setQuantity(value);
                }}
                onBlur={commitQuantity}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); commitQuantity(); }
                }}
                aria-label="Количество товара"
                data-testid="product-quantity-input"
              />
              <button type="button" onClick={() => setSafeQuantity(quantity + 1)} disabled={!isClient || quantity >= maximum} aria-label="Увеличить количество">+</button>
            </div>
          </div>

          <div className={styles.presets} aria-label="Быстрый выбор количества">
            {quantityPresets.filter((preset) => preset <= maximum).map((preset) => (
              <button
                key={preset}
                type="button"
                className={quantity === preset ? styles.presetActive : styles.preset}
                onClick={() => setSafeQuantity(preset)}
                disabled={!isClient}
                data-testid={`quantity-preset-${preset}`}
              >
                {preset} ед.
              </button>
            ))}
          </div>
        </>
      ) : null}

      {product.inventoryPolicy === "TRACKED" && product.stock !== null && product.stock > 0 ? (
        <p className={styles.stockHint}>В наличии {product.stock} ед.</p>
      ) : null}
      {isPreorder ? (
        <p className={styles.stockHint} role="status" data-testid="product-preorder-notice">
          {product.inventoryPolicy === "TRACKED" ? `${quantity - (product.stock ?? 0)} ед. — под заказ. ` : "Под заказ. "}
          Менеджер согласует с вами срок поставки до оплаты.
        </p>
      ) : null}

      <p className={styles.total}>Итого: {formatPrice(total)}</p>

      <div className={styles.actions}>
        {product.inventoryPolicy === "TRACKED" && (product.stock ?? 0) < MAX_QUANTITY ? (
          <button type="button" className={styles.preorderBtn}
            disabled={!isClient}
            onClick={() => setSafeQuantity(Math.max(quantity, (product.stock ?? 0) + 1))}
            data-testid="product-preorder-button">
            Под заказ
          </button>
        ) : null}
        <button type="button" className={styles.primaryBtn} onClick={handleAdd} disabled={!isClient || !product.isAvailable} data-testid="product-add-to-cart">
          {product.isAvailable
            ? added
              ? `Добавлено: ${quantity} ед.`
              : isPreorder ? `Заказать ${quantity} ед.` : `Добавить ${quantity} ед. в корзину`
            : "Нет в наличии"}
        </button>
      </div>

      <p className={styles.stockHint}>{product.packLabel === "Фасовка уточняется" ? "Фасовка одной единицы уточняется." : `В одной единице: ${product.packLabel}. Количество не меняет фасовку.`}</p>
      <p className={styles.receiving}>Самовывоз бесплатно. Доставка по Воронежу — стоимость согласуется отдельно. <Link href="/delivery">Условия получения</Link></p>

      <div className={styles.mobileSticky}>
        <div><strong>{formatPrice(total)}</strong><small>{quantity} ед.{isPreorder ? " · под заказ" : ""}</small></div>
        <button type="button" onClick={handleAdd} disabled={!isClient || !product.isAvailable}>
          {product.isAvailable ? (added ? "Добавлено" : "В корзину") : "Нет в наличии"}
        </button>
      </div>
    </div>
  );
}
