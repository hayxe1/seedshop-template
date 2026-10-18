"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminShell from "../admin-shell";
import {
  adminOrderSchema,
  confirmPreorderResultSchema,
  orderStatusResultSchema,
  parseApiResponse,
  refundOrderResultSchema,
  shipmentResultSchema,
  type AdminOrder,
  type FulfillmentStatus,
} from "@/shared/api/contracts";
import type { AdminNotification } from "../admin-notifications";
import { getAdminOrderStatusLabel } from "../order-status-labels";
import styles from "./orders.module.css";

const pageSize = 8;

const statusFilters: { value: FulfillmentStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Все" },
  { value: "NEW", label: "Новые" },
  { value: "PROCESSING", label: "В обработке" },
  { value: "PACKED", label: "Собраны" },
  { value: "SHIPPED", label: "Отправлены" },
  { value: "DELIVERED", label: "Доставлены" },
  { value: "CANCELLED", label: "Отменены" },
];

const transitions: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  NEW: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const shippingMethodLabels = {
  SELF_PICKUP: "Бесплатный самовывоз",
  LOCAL_COURIER: "Доставка по Воронежу",
  MANAGER_QUOTE: "Согласовать вручную (старый заказ)",
  CDEK_PICKUP: "СДЭК — пункт выдачи (старый заказ)",
} as const;

const paymentStatusLabels: Record<AdminOrder["paymentStatus"], string> = {
  NOT_STARTED: "Оплата не начата",
  PENDING: "Ожидает оплаты",
  WAITING_FOR_CAPTURE: "Ожидает списания",
  SUCCEEDED: "Оплачен",
  CANCELED: "Оплата отменена",
  FAILED: "Ошибка оплаты",
  REFUNDED: "Деньги возвращены",
};

type ShipmentDraft = {
  method: keyof typeof shippingMethodLabels;
  price: string;
  address: string;
  trackingNumber: string;
  managerNote: string;
};

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shipmentDraft(order: AdminOrder): ShipmentDraft {
  return {
    method: order.shipment?.method ?? order.shippingMethod,
    price: String(order.shipment?.price ?? order.shippingPrice),
    address: order.shipment?.addressSnapshot ?? order.address ?? "",
    trackingNumber: order.shipment?.trackingNumber ?? "",
    managerNote: order.shipment?.managerNote ?? "",
  };
}

function getOrderStatusLabel(
  status: FulfillmentStatus,
  shippingMethod: AdminOrder["shippingMethod"]
) {
  if (shippingMethod === "SELF_PICKUP") {
    if (status === "SHIPPED") return "Готов к выдаче";
    if (status === "DELIVERED") return "Выдан";
  }

  return getAdminOrderStatusLabel(status);
}

function visiblePages(currentPage: number, totalPages: number) {
  const start = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  const end = Math.min(totalPages, start + 2);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

function parsePage(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function parseStatusFilter(value: string | null): FulfillmentStatus | "ALL" {
  return statusFilters.some((filter) => filter.value === value)
    ? (value as FulfillmentStatus | "ALL")
    : "ALL";
}

function getNextActionHint(order: AdminOrder) {
  if (order.preorderRequired && !order.preorderConfirmedAt) return "Согласуйте срок поставки с покупателем и подтвердите его ниже. Затем покупатель сможет оплатить заказ.";
  if (order.requiresStockReview) return "Сверьте остаток перед подтверждением.";
  if (order.fulfillmentStatus === "NEW") return "Подтвердите заказ или отмените его.";
  if (order.fulfillmentStatus === "PROCESSING") return "Соберите товары и переведите заказ в «Собран».";
  if (order.fulfillmentStatus === "PACKED") {
    return order.shippingMethod === "SELF_PICKUP"
      ? "Сообщите покупателю, что заказ готов к выдаче."
      : "Передайте заказ в доставку и добавьте трек-номер.";
  }
  if (order.fulfillmentStatus === "SHIPPED") {
    return order.shippingMethod === "SELF_PICKUP"
      ? "Отметьте выдачу после получения."
      : "Отметьте доставку после подтверждения.";
  }
  if (order.fulfillmentStatus === "DELIVERED") return "Заказ закрыт.";
  return "Заказ отменён, дополнительных действий нет.";
}

export default function OrdersClient({
  notifications,
}: {
  notifications: AdminNotification[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const didInitializeFilters = useRef(false);
  const searchQuery = searchParams.get("q") ?? "";
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [savingShipmentId, setSavingShipmentId] = useState<string | null>(null);
  const [refundingOrderId, setRefundingOrderId] = useState<string | null>(null);
  const [refundConfirmations, setRefundConfirmations] = useState<Record<string, boolean>>({});
  const [refundReasons, setRefundReasons] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [preorderNotes, setPreorderNotes] = useState<Record<string, string>>({});
  const [confirmingPreorderId, setConfirmingPreorderId] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, FulfillmentStatus>>({});
  const [shipmentDrafts, setShipmentDrafts] = useState<Record<string, ShipmentDraft>>({});
  const [statusFilter, setStatusFilter] = useState<FulfillmentStatus | "ALL">(
    parseStatusFilter(searchParams.get("status"))
  );
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");
  const [page, setPage] = useState(parsePage(searchParams.get("page")));
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const confirmPreorder = async (orderId: string) => {
    setConfirmingPreorderId(orderId);
    setError(null);
    try {
      await parseApiResponse(await fetch(`/api/admin/orders/${orderId}/preorder`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: preorderNotes[orderId] ?? "" }),
      }), confirmPreorderResultSchema);
      setNotice("Срок поставки подтверждён. Покупатель может оплатить заказ на его странице.");
      await loadOrders();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось подтвердить срок.");
    } finally {
      setConfirmingPreorderId(null);
    }
  };

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (dateFrom.trim()) params.set("dateFrom", dateFrom.trim());
      if (dateTo.trim()) params.set("dateTo", dateTo.trim());

      const result = await parseApiResponse(
        await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" }),
        adminOrderSchema.array()
      );
      setOrders(result.data);
      setTotal(result.meta?.total ?? 0);
      setTotalPages(result.meta?.totalPages ?? 1);
      setStatusDrafts(
        Object.fromEntries(result.data.map((order) => [order.id, order.fulfillmentStatus]))
      );
      setShipmentDrafts(
        Object.fromEntries(result.data.map((order) => [order.id, shipmentDraft(order)]))
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить заказы.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, page, searchQuery, statusFilter]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setStatusFilter(parseStatusFilter(searchParams.get("status")));
    setDateFrom(searchParams.get("dateFrom") ?? "");
    setDateTo(searchParams.get("dateTo") ?? "");
    setPage(parsePage(searchParams.get("page")));
  }, [searchParams]);

  useEffect(() => {
    if (!didInitializeFilters.current) {
      didInitializeFilters.current = true;
      return;
    }

    setPage(1);
  }, [dateFrom, dateTo, searchQuery, statusFilter]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (dateFrom.trim()) params.set("dateFrom", dateFrom.trim());
    if (dateTo.trim()) params.set("dateTo", dateTo.trim());
    if (page > 1) params.set("page", String(page));

    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [dateFrom, dateTo, page, pathname, router, searchParams, searchQuery, statusFilter]);

  const pages = useMemo(() => visiblePages(page, totalPages), [page, totalPages]);
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  const saveStatus = async (orderId: string) => {
    const nextStatus = statusDrafts[orderId];
    if (!nextStatus) return;
    setSavingOrderId(orderId);
    setError(null);
    setNotice(null);
    try {
      const result = await parseApiResponse(
        await fetch(`/api/admin/orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }),
        orderStatusResultSchema
      );
      setOrders((current) =>
        current.map((order) =>
          order.id === result.data.id
            ? {
                ...order,
                fulfillmentStatus: result.data.status,
                updatedAt: result.data.updatedAt,
                statusHistory: [
                  ...order.statusHistory,
                  {
                    id: `local:${result.data.updatedAt}`,
                    from: order.fulfillmentStatus,
                    to: result.data.status,
                    actorType: "admin",
                    note: null,
                    createdAt: result.data.updatedAt,
                  },
                ],
              }
            : order
        )
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось обновить статус.");
    } finally {
      setSavingOrderId(null);
    }
  };

  const saveShipment = async (orderId: string) => {
    const draft = shipmentDrafts[orderId];
    if (!draft) return;
    setSavingShipmentId(orderId);
    setError(null);
    setNotice(null);
    try {
      const result = await parseApiResponse(
        await fetch(`/api/admin/orders/${orderId}/shipment`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: draft.method,
            price: Number(draft.price || 0),
            address: draft.address || null,
            trackingNumber: draft.trackingNumber,
            managerNote: draft.managerNote,
          }),
        }),
        shipmentResultSchema
      );
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                shippingMethod: result.data.method,
                shippingPrice: result.data.price,
                address: result.data.addressSnapshot,
                shipment: {
                  ...result.data,
                  shippedAt: order.shipment?.shippedAt ?? null,
                  deliveredAt: order.shipment?.deliveredAt ?? null,
                },
              }
            : order
        )
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить доставку.");
    } finally {
      setSavingShipmentId(null);
    }
  };

  const updateShipmentDraft = (orderId: string, patch: Partial<ShipmentDraft>) => {
    setShipmentDrafts((current) => ({
      ...current,
      [orderId]: { ...current[orderId]!, ...patch },
    }));
  };

  const refundPayment = async (order: AdminOrder) => {
    if (!refundConfirmations[order.id]) return;
    setRefundingOrderId(order.id);
    setError(null);
    setNotice(null);

    try {
      const result = await parseApiResponse(
        await fetch(`/api/admin/orders/${order.id}/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: refundReasons[order.id] ?? "" }),
        }),
        refundOrderResultSchema
      );

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? {
                ...item,
                paymentStatus: result.data.paymentStatus,
                paymentUpdatedAt: result.data.paymentUpdatedAt,
                requiresPaymentReview: result.data.refundStatus !== "succeeded",
              }
            : item
        )
      );
      setRefundConfirmations((current) => ({ ...current, [order.id]: false }));
      setNotice(
        result.data.refundStatus === "succeeded"
          ? `По заказу ${order.orderNumber} возвращено ${formatPrice(order.totalPrice)}.`
          : `Возврат по заказу ${order.orderNumber} принят YooKassa и ожидает завершения.`
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось выполнить возврат.");
    } finally {
      setRefundingOrderId(null);
    }
  };

  return (
    <AdminShell
      title="Заказы"
      subtitle={`${total.toLocaleString("ru-RU")} заказов`}
      search={{ mode: "catalog", placeholder: "Номер, клиент, телефон или email", label: "Поиск заказов" }}
      notifications={notifications}
      compactContent
    >
      <section className={styles.filtersPanel} aria-label="Фильтры заказов">
        <div className={styles.statusTabs}>
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={filter.value === statusFilter ? styles.statusTabActive : ""}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className={styles.dateRange}>
          <label><span>С</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label><span>По</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        </div>
      </section>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.success} role="status">{notice}</p> : null}

      <section className={styles.ordersList} aria-live="polite" aria-busy={loading}>
        {loading ? <p className={styles.emptyState}>Загружаем заказы…</p> : null}
        {!loading && orders.length === 0 ? <p className={styles.emptyState}>Заказы не найдены.</p> : null}
        {!loading
          ? orders.map((order) => {
              const draft = shipmentDrafts[order.id] ?? shipmentDraft(order);
              const availableStatuses = [
                order.fulfillmentStatus,
                ...transitions[order.fulfillmentStatus],
              ];

              return (
                <article className={styles.orderCard} key={order.id} data-testid="admin-order-card">
                  <header className={styles.orderHeader}>
                    <div>
                      <strong className={styles.orderId}>{order.orderNumber}</strong>
                      <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
                    </div>
                    <div className={styles.headerBadges}>
                      {order.isRepeatCustomer ? <span className={styles.repeatBadge}>Повторный клиент</span> : null}
                      {order.requiresStockReview ? <span className={styles.warningBadge}>Проверить остаток</span> : null}
                      {order.preorderRequired ? <span className={styles.warningBadge}>{order.preorderConfirmedAt ? "Под заказ · срок подтверждён" : "Под заказ · согласовать срок"}</span> : null}
                      <span className={`${styles.statusBadge} ${styles[`status${order.fulfillmentStatus}`]}`}>
                        {getOrderStatusLabel(order.fulfillmentStatus, order.shippingMethod)}
                      </span>
                    </div>
                  </header>

                  <div className={styles.orderGrid}>
                    <section className={styles.customerBlock}>
                      <h2>Покупатель</h2>
                      <strong>{order.customerName}</strong>
                      <a href={`tel:${order.phone}`}>{order.phone}</a>
                      {order.email ? <a href={`mailto:${order.email}`}>{order.email}</a> : <span>Email не указан</span>}
                      <p>
                        {order.shippingMethod === "SELF_PICKUP"
                          ? "Самовывоз — место сообщить покупателю после подтверждения"
                          : order.address ?? "Адрес ещё не указан"}
                      </p>
                      {order.comment ? <blockquote>{order.comment}</blockquote> : null}
                    </section>

                    <section className={styles.itemsBlock}>
                      <div className={styles.blockHeading}>
                        <h2>Состав</h2>
                        <strong>{formatPrice(order.totalPrice)}</strong>
                      </div>
                      <ul className={styles.orderItems}>
                        {order.items.map((item) => (
                          <li key={item.id} data-testid={item.kind === "SEED_SET" ? "admin-seed-set-order-item" : "admin-product-order-item"}>
                            <div><strong>{item.productNameSnapshot}</strong><span>{item.quantity} × {formatPrice(item.priceSnapshot)}</span></div>
                            {item.contents.length > 0 ? <small>В наборе: {item.contents.join(", ")}</small> : null}
                            {item.isPreorder ? <small>Под заказ</small> : null}
                          </li>
                        ))}
                      </ul>
                      {order.paymentStatus !== "REFUNDED" && order.fulfillmentStatus !== "CANCELLED" && order.backorders.length > 0 ? (
                        <p className={styles.nextAction}>
                          Нужно поставить: {order.backorders.map((row) => `${row.name} — ${row.quantity} ед.`).join("; ")}.
                          После поступления внесите остаток на склад и переведите оплаченный заказ в «Собран».
                        </p>
                      ) : null}
                      <dl className={styles.priceBreakdown}>
                        <div><dt>Товары</dt><dd>{formatPrice(order.subtotalPrice)}</dd></div>
                        {order.giftWrapPrice > 0 ? <div><dt>Упаковка</dt><dd>{formatPrice(order.giftWrapPrice)}</dd></div> : null}
                        <div>
                          <dt>{order.shippingMethod === "SELF_PICKUP" ? "Самовывоз" : "Доставка отдельно"}</dt>
                          <dd>
                            {order.shippingMethod === "SELF_PICKUP"
                              ? "Бесплатно"
                              : order.shippingPrice > 0
                                ? formatPrice(order.shippingPrice)
                                : "Не согласована"}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section className={styles.operationsBlock}>
                      <p className={styles.paymentSummary}>
                        <span>Оплата</span>
                        <strong>{paymentStatusLabels[order.paymentStatus]}</strong>
                      </p>
                      <div className={styles.statusControl}>
                        <label>
                          <span>Статус заказа</span>
                          <select
                            value={statusDrafts[order.id] ?? order.fulfillmentStatus}
                            onChange={(event) => setStatusDrafts((current) => ({ ...current, [order.id]: event.target.value as FulfillmentStatus }))}
                            aria-label={`Статус заказа ${order.orderNumber}`}
                            data-testid="admin-order-status"
                          >
                            {availableStatuses.map((status) => <option key={status} value={status}>{getOrderStatusLabel(status, order.shippingMethod)}</option>)}
                          </select>
                        </label>
                        <button type="button" onClick={() => void saveStatus(order.id)} disabled={savingOrderId === order.id || (statusDrafts[order.id] ?? order.fulfillmentStatus) === order.fulfillmentStatus} data-testid="admin-save-status">
                          {savingOrderId === order.id ? "Сохраняем…" : "Сохранить статус"}
                        </button>
                      </div>
                      <p className={styles.nextAction}>{getNextActionHint(order)}</p>
                      {order.preorderRequired && !order.preorderConfirmedAt && order.fulfillmentStatus !== "CANCELLED" ? (
                        <div className={styles.preorderControl}>
                          <label>
                            <span>Срок поставки, согласованный с покупателем</span>
                            <input value={preorderNotes[order.id] ?? ""} maxLength={500}
                              onChange={(event) => setPreorderNotes((current) => ({ ...current, [order.id]: event.target.value }))}
                              placeholder="Например, до 15 октября" data-testid="admin-preorder-note" />
                          </label>
                          <button type="button" onClick={() => void confirmPreorder(order.id)}
                            disabled={confirmingPreorderId === order.id || (preorderNotes[order.id] ?? "").trim().length < 3}
                            data-testid="admin-confirm-preorder">
                            {confirmingPreorderId === order.id ? "Подтверждаем…" : "Срок согласован — разрешить оплату"}
                          </button>
                        </div>
                      ) : null}
                      {order.preorderNote ? <p>Согласованный срок: {order.preorderNote}</p> : null}
                      {order.paymentStatus === "REFUNDED" ? (
                        <p className={styles.refundComplete}>Полный возврат выполнен через YooKassa.</p>
                      ) : null}
                      {order.fulfillmentStatus === "CANCELLED" && order.paymentStatus === "SUCCEEDED" ? (
                        <details className={styles.refundDetails}>
                          <summary>Вернуть оплату через YooKassa</summary>
                          <div className={styles.refundForm}>
                            <p>
                              Покупателю будет возвращена вся сумма — {formatPrice(order.totalPrice)}.
                              Отменить выполненный возврат нельзя.
                            </p>
                            <label>
                              <span>Причина для истории операции</span>
                              <input
                                value={refundReasons[order.id] ?? ""}
                                maxLength={500}
                                placeholder="Например: заказ отменён по согласованию"
                                onChange={(event) =>
                                  setRefundReasons((current) => ({
                                    ...current,
                                    [order.id]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label className={styles.refundConfirmation}>
                              <input
                                type="checkbox"
                                checked={refundConfirmations[order.id] ?? false}
                                onChange={(event) =>
                                  setRefundConfirmations((current) => ({
                                    ...current,
                                    [order.id]: event.target.checked,
                                  }))
                                }
                              />
                              <span>Подтверждаю полный возврат по заказу {order.orderNumber}</span>
                            </label>
                            <button
                              type="button"
                              className={styles.refundButton}
                              disabled={
                                refundingOrderId === order.id ||
                                !(refundConfirmations[order.id] ?? false)
                              }
                              onClick={() => void refundPayment(order)}
                              data-testid="admin-refund-payment"
                            >
                              {refundingOrderId === order.id
                                ? "Отправляем запрос…"
                                : `Вернуть ${formatPrice(order.totalPrice)}`}
                            </button>
                          </div>
                        </details>
                      ) : null}
                    </section>
                  </div>

                  <details className={styles.deliveryDetails}>
                    <summary>Получение заказа и внутренняя заметка</summary>
                    <div className={styles.deliveryForm}>
                      <label><span>Способ</span><select value={draft.method} onChange={(event) => updateShipmentDraft(order.id, { method: event.target.value as ShipmentDraft["method"] })}>{Object.entries(shippingMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <label><span>Стоимость, ₽</span><input type="number" min="0" value={draft.method === "SELF_PICKUP" ? "0" : draft.price} disabled={draft.method === "SELF_PICKUP"} onChange={(event) => updateShipmentDraft(order.id, { price: event.target.value })} /></label>
                      <label className={styles.wideField}><span>{draft.method === "SELF_PICKUP" ? "Адрес не публикуется" : "Адрес"}</span><textarea rows={2} value={draft.method === "SELF_PICKUP" ? "" : draft.address} disabled={draft.method === "SELF_PICKUP"} placeholder={draft.method === "LOCAL_COURIER" ? "Воронеж, улица, дом, квартира" : undefined} onChange={(event) => updateShipmentDraft(order.id, { address: event.target.value })} /></label>
                      <label><span>Трек-номер</span><input value={draft.trackingNumber} onChange={(event) => updateShipmentDraft(order.id, { trackingNumber: event.target.value })} /></label>
                      <label className={styles.wideField}><span>Заметка менеджера</span><textarea rows={2} value={draft.managerNote} onChange={(event) => updateShipmentDraft(order.id, { managerNote: event.target.value })} /></label>
                      <button type="button" onClick={() => void saveShipment(order.id)} disabled={savingShipmentId === order.id}>{savingShipmentId === order.id ? "Сохраняем…" : "Сохранить доставку"}</button>
                    </div>
                  </details>

                  <details className={styles.auditDetails}>
                    <summary>История статусов</summary>
                    <div className={styles.auditGrid}>
                      <ol>{order.statusHistory.map((entry) => <li key={entry.id}><strong>{getOrderStatusLabel(entry.to, order.shippingMethod)}</strong><time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>{entry.note ? <span>{entry.note}</span> : null}</li>)}</ol>
                    </div>
                  </details>
                </article>
              );
            })
          : null}
      </section>

      <footer className={styles.paginationFooter}>
        <p>Показаны {rangeStart}–{rangeEnd} из {total.toLocaleString("ru-RU")}</p>
        <nav aria-label="Пагинация заказов">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} aria-label="Предыдущая страница">←</button>
          {pages.map((pageNumber) => <button key={pageNumber} type="button" className={pageNumber === page ? styles.currentPage : ""} onClick={() => setPage(pageNumber)} aria-current={pageNumber === page ? "page" : undefined}>{pageNumber}</button>)}
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages} aria-label="Следующая страница">→</button>
        </nav>
      </footer>
    </AdminShell>
  );
}
