"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  paymentRefreshResultSchema,
  publicOrderSchema,
  parseApiResponse,
  type FulfillmentStatus,
  type PaymentStatus,
  type PublicOrder,
} from "@/shared/api/contracts";
import { trackPurchase } from "@/shared/analytics/client";
import { useCart } from "@/shared/cart/cart-context";
import styles from "./order.module.css";

const pendingPaymentStatuses = new Set<PaymentStatus>(["PENDING", "WAITING_FOR_CAPTURE"]);

const paymentLabels: Record<PaymentStatus, { title: string; text: string }> = {
  NOT_STARTED: { title: "Оплата не начата", text: "Заказ сохранён и ждёт оплаты." },
  PENDING: { title: "Ожидаем оплату", text: "Если вы уже оплатили, статус обновится автоматически." },
  WAITING_FOR_CAPTURE: { title: "Платёж подтверждается", text: "YooKassa завершает обработку платежа." },
  SUCCEEDED: { title: "Заказ оплачен", text: "Мы получили оплату и начинаем обработку заказа." },
  CANCELED: { title: "Оплата отменена", text: "Заказ сохранён — оплату можно повторить." },
  FAILED: { title: "Оплата не открылась", text: "Заказ сохранён — попробуйте открыть оплату ещё раз." },
  REFUNDED: { title: "Средства возвращены", text: "Срок зачисления зависит от банка." },
};

const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  NEW: "Новый заказ",
  PROCESSING: "В обработке",
  PACKED: "Заказ собран",
  SHIPPED: "Передан в доставку",
  DELIVERED: "Доставлен",
  CANCELLED: "Отменён",
};

const shippingMethodLabels: Record<PublicOrder["shippingMethod"], string> = {
  SELF_PICKUP: "Бесплатный самовывоз",
  LOCAL_COURIER: "Доставка по Воронежу",
  MANAGER_QUOTE: "Доставка по согласованию",
  CDEK_PICKUP: "Пункт выдачи СДЭК",
};

function getFulfillmentLabel(
  status: FulfillmentStatus,
  shippingMethod: PublicOrder["shippingMethod"]
) {
  if (shippingMethod === "SELF_PICKUP") {
    if (status === "SHIPPED") return "Готов к выдаче";
    if (status === "DELIVERED") return "Заказ выдан";
  }

  return fulfillmentLabels[status];
}

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderStatusClient({
  token,
  initialOrder,
}: {
  token: string;
  initialOrder: PublicOrder;
}) {
  const { completeCheckout } = useCart();
  const [order, setOrder] = useState(initialOrder);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const payment = paymentLabels[order.paymentStatus];

  const clearPaidCart = useCallback(() => {
    if (order.paymentStatus !== "SUCCEEDED") {
      return;
    }

    void completeCheckout(order.orderNumber, order.items.filter(item => item.kind !== "SERVICE").map(item => ({
      itemKey: item.kind === "SEED_SET" ? `seedSet:${item.seedSetId}` : `product:${item.productId}`,
      quantity: item.quantity,
    })));
  }, [completeCheckout, order.items, order.orderNumber, order.paymentStatus]);

  useEffect(() => {
    clearPaidCart();
  }, [clearPaidCart]);

  useEffect(() => {
    if (order.paymentStatus !== "SUCCEEDED") return;

    trackPurchase({
      orderId: order.orderNumber,
      revenue: order.totalPrice,
      products: order.items
        .filter((item) => item.kind !== "SERVICE")
        .map((item) => ({
          id:
            item.kind === "SEED_SET"
              ? `seed-set:${item.seedSetId ?? item.id}`
              : item.productId ?? item.id,
          name: item.name,
          ...(item.category ? { category: item.category } : {}),
          price: item.price,
          quantity: item.quantity,
        })),
    });
  }, [order.items, order.orderNumber, order.paymentStatus, order.totalPrice]);

  useEffect(() => {
    if (!pendingPaymentStatuses.has(order.paymentStatus)) {
      return;
    }

    let stopped = false;
    let attempts = 0;
    const refresh = async () => {
      attempts += 1;
      try {
        const result = await parseApiResponse(
          await fetch("/api/payment/result/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          }),
          paymentRefreshResultSchema
        );
        if (!stopped) {
          setRefreshError(null);
          setOrder((current) => ({
            ...current,
            paymentStatus: result.data.paymentStatus,
            fulfillmentStatus: result.data.fulfillmentStatus,
            paymentConfirmationUrl: result.data.paymentConfirmationUrl,
            canRetryPayment: result.data.canRetryPayment,
          }));
        }
      } catch (error) {
        if (!stopped) {
          setRefreshError(error instanceof Error ? error.message : "Не удалось обновить статус.");
        }
      }
    };

    const initialRefreshTimer = window.setTimeout(() => {
      void refresh();
    }, 0);
    const timer = window.setInterval(() => {
      if (attempts >= 30) {
        window.clearInterval(timer);
        return;
      }
      void refresh();
    }, 2_000);

    return () => {
      stopped = true;
      window.clearTimeout(initialRefreshTimer);
      window.clearInterval(timer);
    };
  }, [order.paymentStatus, token]);

  const retryPayment = async () => {
    setRetrying(true);
    setRefreshError(null);
    try {
      const result = await parseApiResponse(
        await fetch(`/api/orders/${encodeURIComponent(token)}/payment-attempts`, {
          method: "POST",
        }),
        publicOrderSchema
      );
      setOrder(result.data);
      if (result.data.paymentConfirmationUrl) {
        window.location.assign(result.data.paymentConfirmationUrl);
      }
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Не удалось повторить оплату.");
    } finally {
      setRetrying(false);
    }
  };

  const refreshOrder = async () => {
    try {
      const result = await parseApiResponse(await fetch(`/api/orders/${encodeURIComponent(token)}`, { cache: "no-store" }), publicOrderSchema);
      setOrder(result.data);
      setRefreshError(null);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Не удалось обновить заказ.");
    }
  };

  const totalItems = useMemo(
    () => order.items.filter(item => item.kind !== "SERVICE").reduce((sum, item) => sum + item.quantity, 0),
    [order.items]
  );

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div>
            <p className={styles.orderNumber}>Заказ {order.orderNumber}</p>
            <h1>{order.preorderPending ? "Согласуем срок поставки" : payment.title}</h1>
            <p>{order.preorderPending ? "Заказ принят. Менеджер свяжется с вами и подтвердит срок поставки до оплаты." : payment.text}</p>
            {order.preorderNote ? <p>Согласованный срок: {order.preorderNote}</p> : null}
          </div>
          <span className={`${styles.paymentBadge} ${styles[`payment${order.paymentStatus}`]}`}>
            {payment.title}
          </span>
        </header>

        {refreshError ? (
          <p className={styles.alert} role="status">
            {refreshError}
          </p>
        ) : null}

        <div className={styles.actions}>
          {order.preorderPending ? <button type="button" className={styles.secondaryButton} onClick={() => void refreshOrder()}>Обновить статус</button> : null}
          {order.paymentConfirmationUrl && pendingPaymentStatuses.has(order.paymentStatus) ? (
            <a href={order.paymentConfirmationUrl} className={styles.primaryButton} referrerPolicy="no-referrer" rel="noreferrer">
              Продолжить оплату
            </a>
          ) : null}
          {order.canRetryPayment ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void retryPayment()}
              disabled={retrying}
            >
              {retrying ? "Создаём оплату…" : order.paymentStatus === "NOT_STARTED" ? "Оплатить заказ" : "Повторить оплату"}
            </button>
          ) : null}
          <Link href="/catalog" className={styles.secondaryButton}>
            Вернуться в каталог
          </Link>
        </div>

        <div className={styles.layout}>
          <section className={styles.mainPanel} aria-labelledby="order-items-title">
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="order-items-title">Состав заказа</h2>
                <p>Количество: {totalItems} ед.</p>
              </div>
              <strong>{formatPrice(order.totalPrice)}</strong>
            </div>
            <ul className={styles.items}>
              {order.items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    {item.isPreorder ? <small>Под заказ</small> : null}
                    {item.contents.length > 0 ? (
                      <small>В наборе: {item.contents.join(", ")}</small>
                    ) : null}
                  </div>
                  <span>
                    {item.quantity} × {formatPrice(item.price)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className={styles.totals}>
              <div><dt>Товары</dt><dd>{formatPrice(order.subtotalPrice)}</dd></div>
              {order.giftWrapPrice > 0 ? <div><dt>Упаковка</dt><dd>{formatPrice(order.giftWrapPrice)}</dd></div> : null}
              {order.discountPrice > 0 ? <div><dt>Скидка</dt><dd>−{formatPrice(order.discountPrice)}</dd></div> : null}
              <div>
                <dt>{order.shippingMethod === "SELF_PICKUP" ? "Самовывоз" : "Доставка"}</dt>
                <dd>
                  {order.shippingMethod === "SELF_PICKUP"
                    ? "бесплатно"
                    : order.shippingPrice > 0
                      ? formatPrice(order.shippingPrice)
                      : "менеджер свяжется"}
                </dd>
              </div>
              <div className={styles.totalRow}><dt>Оплачиваемая сумма</dt><dd>{formatPrice(order.totalPrice)}</dd></div>
            </dl>
          </section>

          <aside className={styles.sidePanel}>
            <section>
              <h2>Получение заказа</h2>
              <strong className={styles.fulfillmentStatus}>
                {getFulfillmentLabel(order.fulfillmentStatus, order.shippingMethod)}
              </strong>
              <p>{shippingMethodLabels[order.shippingMethod]}</p>
              <p>
                {order.shippingMethod === "SELF_PICKUP"
                  ? "После оплаты менеджер сообщит место и согласует время выдачи."
                  : order.address ?? "Менеджер уточнит адрес при подтверждении."}
              </p>
              {order.shipment?.trackingNumber ? <p>Трек: {order.shipment.trackingNumber}</p> : null}
            </section>
            <section>
              <h2>Контакты</h2>
              <p>{order.customerName}</p>
              <p>{order.phone}</p>
              {order.email ? <p>{order.email}</p> : null}
            </section>
            <section>
              <h2>История</h2>
              <ol className={styles.timeline}>
                {(order.timeline.length > 0
                  ? order.timeline
                  : [{ status: order.fulfillmentStatus, note: null, createdAt: order.createdAt }]
                ).map((entry, index) => (
                  <li key={`${entry.status}:${entry.createdAt}:${index}`}>
                    <strong>{getFulfillmentLabel(entry.status, order.shippingMethod)}</strong>
                    <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                    {entry.note ? <span>{entry.note}</span> : null}
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
