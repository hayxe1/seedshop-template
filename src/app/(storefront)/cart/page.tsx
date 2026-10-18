"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useCart } from "@/shared/cart/cart-context";
import { isCartItemPreorder, PREORDER_NOTICE } from "@/shared/cart/preorder";
import styles from "./cart.module.css";
import CartReview from "@/features/cart/cart-review";
import CartQuantityInput from "@/features/cart/cart-quantity-input";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const positionPluralRules = new Intl.PluralRules("ru-RU");

function getPositionLabel(count: number) {
  const pluralCategory = positionPluralRules.select(count);
  if (pluralCategory === "one") return "позиция";
  if (pluralCategory === "few") return "позиции";
  return "позиций";
}

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function getItemSubtotal(item: { price: number; quantity: number }) {
  return item.price * item.quantity;
}

function getUnitLabel(item: { kind: string }) {
  return item.kind === "seedSet" ? "за набор" : "за единицу";
}

export default function CartPage() {
  const { items, totalItems, totalPrice, updateQuantity, removeItem, clearCart, cartChecking, cartError, unavailableItems } = useCart();
  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Ваш заказ</p>
            <h1>Корзина</h1>
            <p>Проверьте состав заказа, количество товаров и итог перед оформлением.</p>
          </div>
        </header>

        {!isClient ? (
          <section className={styles.emptyPanel}>
            <p className={styles.kicker}>Загрузка</p>
            <h2>Проверяем корзину</h2>
            <p>Поднимаем сохраненные товары и суммы.</p>
          </section>
        ) : items.length === 0 ? (
          <section className={styles.emptyPanel}>
            <p className={styles.kicker}>Пока пусто</p>
            <h2>Добавьте товары в корзину</h2>
            <p>Выберите семена в каталоге или начните с готового набора.</p>
            <div className={styles.emptyActions}>
              <Link href="/catalog" className={styles.primaryButton}>
                Перейти в каталог
              </Link>
              <Link href="/sets" className={styles.secondaryButton}>
                Посмотреть наборы
              </Link>
            </div>
          </section>
        ) : (
          <section className={styles.layout}>
            <div className={styles.itemsColumn} aria-label="Товары в корзине">
              <CartReview />
              <div className={styles.listHead}>
                <div>
                  <p className={styles.kicker}>Состав</p>
                  <h2>{items.length} {getPositionLabel(items.length)}</h2>
                </div>
                <div className={styles.listActions}>
                  <span>{totalItems} ед.</span>
                  <button
                    type="button"
                    className={styles.clearButton}
                    onClick={() => clearCart()}
                    data-testid="cart-clear"
                  >
                    Очистить корзину
                  </button>
                </div>
              </div>

              <div className={styles.list}>
                {items.map((item) => (
                    <article key={item.itemKey} className={styles.item} data-testid="cart-item">
                      <div className={styles.imageBox} aria-hidden="true">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt=""
                            width={72}
                            height={110}
                            className={styles.image}
                          />
                        ) : (
                          <span>{item.name.slice(0, 1)}</span>
                        )}
                      </div>

                      <div className={styles.itemInfo}>
                        <div className={styles.itemTitleRow}>
                          <h3><Link href={item.kind === "seedSet" ? `/sets/${item.slug}` : `/product/${item.slug}`}>{item.name}</Link></h3>
                          <strong>{formatPrice(getItemSubtotal(item))}</strong>
                        </div>
                        <p>{formatPrice(item.price)} {getUnitLabel(item)}</p>
                        {isCartItemPreorder(item) ? <p role="status" data-testid="cart-preorder-notice">{PREORDER_NOTICE}</p> : null}

                        <div className={styles.badges}>
                          {item.kind === "seedSet" ? (
                            <span className={styles.setBadge} data-testid="cart-item-seed-set">
                              Набор
                            </span>
                          ) : null}
                          {item.sourceSeedSetName ? (
                            <span className={styles.badge} data-testid="cart-item-source">
                              {item.sourceSeedSetName}
                            </span>
                          ) : null}
                          {item.kind === "product" && item.stock !== null && item.stock !== undefined ? (
                            <span className={styles.badge}>В наличии: {item.stock} ед.</span>
                          ) : null}
                        </div>

                        <div className={styles.itemFooter}>
                          <div className={styles.stepper} aria-label={`Количество: ${item.name}`}>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.itemKey, item.quantity - 1)}
                              aria-label={`Уменьшить количество: ${item.name}`}
                              data-testid="cart-qty-decrease"
                              disabled={item.quantity <= 1}
                            >
                              -
                            </button>
                            <span className={styles.srOnly} data-testid="cart-qty">{item.quantity}</span>
                            <CartQuantityInput quantity={item.quantity} name={item.name} onChange={value => updateQuantity(item.itemKey, value)} />
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.itemKey, item.quantity + 1)}
                              aria-label={`Увеличить количество: ${item.name}`}
                              data-testid="cart-qty-increase"
                              disabled={item.quantity >= 99}
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            className={styles.removeButton}
                            onClick={() => removeItem(item.itemKey)}
                          >
                            Удалить
                          </button>
                        </div>

                        {item.kind === "seedSet" && item.items && item.items.length > 0 ? (
                          <ul className={styles.setContents} data-testid="cart-seed-set-contents">
                            {item.items.map((setItem) => (
                              <li key={setItem.productId}>{setItem.name}</li>
                            ))}
                          </ul>
                        ) : null}

                      </div>
                    </article>
                  ))}
              </div>
            </div>

            <aside className={styles.summary} aria-label="Сводка заказа">
              <p className={styles.kicker}>К оплате</p>
              <strong className={styles.total}>{formatPrice(totalPrice)}</strong>
              <div className={styles.summaryRows}>
                <p>
                  <span>Количество товаров</span>
                  <strong>{totalItems}</strong>
                </p>
              </div>

              <p className={styles.summaryHint}>
                Итог пересчитывается при изменении количества. Если товара не хватит,
                согласуем срок поставки до оплаты. Доставка согласуется отдельно.
              </p>

              <div className={styles.summaryActions}>
                <Link href="/checkout" className={styles.primaryButton} data-testid="cart-checkout"
                  aria-disabled={cartChecking || Boolean(cartError) || unavailableItems.length > 0}
                  onNavigate={event => { if (cartChecking || cartError || unavailableItems.length) event.preventDefault(); }}>
                  Перейти к оформлению
                </Link>
                <Link href="/catalog" className={styles.secondaryButton}>
                  Продолжить покупки
                </Link>
              </div>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}
