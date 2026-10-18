"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useCart } from "@/shared/cart/cart-context";
import styles from "./cart-link-button.module.css";

type CartLinkButtonProps = {
  className?: string | undefined;
};

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function CartLinkButton({ className }: CartLinkButtonProps) {
  const { totalItems } = useCart();
  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  const safeTotalItems = isClient ? totalItems : 0;

  return (
    <Link
      href="/cart"
      className={className ?? styles.button}
      aria-label={`Корзина, товаров: ${safeTotalItems}`}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20 8H6" />
        <circle cx="10" cy="19" r="1.4" />
        <circle cx="17" cy="19" r="1.4" />
      </svg>
      <span className={styles.label} aria-hidden="true">Корзина</span>
      <span className={styles.separator} aria-hidden="true">·</span>
      <span className={styles.count} aria-hidden="true">{safeTotalItems}</span>
    </Link>
  );
}
