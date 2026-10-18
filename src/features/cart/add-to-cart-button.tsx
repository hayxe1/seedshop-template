"use client";

import { MouseEvent, useMemo, useSyncExternalStore } from "react";
import { useCart } from "@/shared/cart/cart-context";
import styles from "./add-to-cart-button.module.css";

type AddToCartButtonProps = {
  item: {
    productId: string;
    slug: string;
    name: string;
    category?: string | undefined;
    price: number;
    stock?: number | null | undefined;
    inventoryPolicy?: "TRACKED" | "PREORDER" | "UNLIMITED" | undefined;
    imageUrl?: string | undefined;
  };
  className?: string | undefined;
  label?: string | undefined;
  disabled?: boolean | undefined;
  disabledLabel?: string | undefined;
};

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function AddToCartButton({ item, className, label, disabled = false, disabledLabel }: AddToCartButtonProps) {
  const { items, addItem, updateQuantity } = useCart();
  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  const itemKey = `product:${item.productId}`;

  const quantityInCart = useMemo(
    () => items.find((cartItem) => cartItem.itemKey === itemKey)?.quantity ?? 0,
    [items, itemKey]
  );

  const safeQuantity = isClient ? quantityInCart : 0;

  const stopCardNavigation = (
    event: MouseEvent<HTMLButtonElement> | MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleAdd = (event: MouseEvent<HTMLButtonElement>) => {
    stopCardNavigation(event);
    if (disabled) return;
    addItem(item);
  };

  const handleIncrease = (event: MouseEvent<HTMLButtonElement>) => {
    stopCardNavigation(event);
    if (disabled || safeQuantity >= 99) return;
    addItem(item);
  };

  const handleDecrease = (event: MouseEvent<HTMLButtonElement>) => {
    stopCardNavigation(event);

    if (quantityInCart <= 1) {
      updateQuantity(itemKey, 0);
      return;
    }

    updateQuantity(itemKey, quantityInCart - 1);
  };

  if (safeQuantity === 0) {
    return (
      <button
        type="button"
        onClick={handleAdd}
        className={`${styles.button} ${className ?? ""}`.trim()}
        aria-label={`Добавить в корзину: ${item.name}`}
        data-testid="add-to-cart-button"
        disabled={disabled}
      >
        {disabled ? disabledLabel ?? "Нет в наличии" : label ?? (item.inventoryPolicy === "PREORDER" || item.stock === 0 ? "Под заказ" : "В корзину")}
      </button>
    );
  }

  return (
    <div
      className={`${styles.stepper} ${className ?? ""}`.trim()}
      role="group"
      aria-label={`Количество в корзине: ${item.name}`}
      onClick={stopCardNavigation}
      data-testid="cart-quantity-stepper"
    >
      <button
        type="button"
        className={styles.stepButton}
        onClick={handleDecrease}
        aria-label={`Уменьшить количество: ${item.name}`}
      >
        -
      </button>
      <span className={styles.qtyValue}>{safeQuantity}</span>
      <button
        type="button"
        className={styles.stepButton}
        onClick={handleIncrease}
        aria-label={`Увеличить количество: ${item.name}`}
        disabled={disabled || safeQuantity >= 99}
      >
        +
      </button>
    </div>
  );
}
