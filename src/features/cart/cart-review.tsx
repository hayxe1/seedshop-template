"use client";

import { useEffect } from "react";
import { useCart } from "@/shared/cart/cart-context";
import styles from "./cart-review.module.css";

export default function CartReview() {
  const { refreshCart, cartChecking, cartError, cartNotice, unavailableItems, removeItem } = useCart();
  useEffect(() => { void refreshCart(); }, [refreshCart]);
  if (!cartChecking && !cartError && !cartNotice && !unavailableItems.length) return null;
  return <div className={styles.review} data-testid="cart-review" aria-busy={cartChecking}>
    {cartChecking ? <p role="status">Проверяем цены и наличие…</p> : null}
    {cartNotice ? <p role="status">{cartNotice}</p> : null}
    {cartError ? <p role="alert">{cartError}</p> : null}
    {unavailableItems.length ? <div role="alert">
      <p>Эти позиции больше недоступны. Удалите их, чтобы продолжить оформление:</p>
      <ul>{unavailableItems.map(item => <li key={item.itemKey}>
        <span>{item.name}</span>
        <button type="button" onClick={() => removeItem(item.itemKey)} aria-label={`Удалить недоступный товар: ${item.name}`}>Удалить</button>
      </li>)}</ul>
    </div> : null}
    {cartError ? <button type="button" onClick={() => void refreshCart()} disabled={cartChecking}>Повторить проверку</button> : null}
  </div>;
}
