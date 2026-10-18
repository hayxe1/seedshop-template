import Link from "next/link";
import type { FulfillmentStatus } from "@/shared/api/contracts";
import { requireAdminUser } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import AdminShell from "./admin-shell";
import { buildAdminNotifications } from "./admin-notifications";
import { getAdminOrderStatusLabel } from "./order-status-labels";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type AdminDashboardPageProps = {
  searchParams?: Promise<{ period?: string }>;
};

type RevenuePeriod = "today" | "week" | "month" | "all";

type RecentOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  fulfillmentStatus: FulfillmentStatus;
  totalPrice: number;
  createdAt: Date;
};

const revenuePeriods: { value: RevenuePeriod; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "all", label: "Все время" },
];

function parseRevenuePeriod(raw: string | undefined): RevenuePeriod {
  if (raw === "week" || raw === "month" || raw === "all") {
    return raw;
  }

  return "today";
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfCurrentWeek() {
  const today = startOfToday();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  today.setDate(today.getDate() + mondayOffset);
  return today;
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getRevenueStartDate(period: RevenuePeriod) {
  if (period === "today") return startOfToday();
  if (period === "week") return startOfCurrentWeek();
  if (period === "month") return startOfCurrentMonth();
  return null;
}

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function getInventoryReasonLabel(reason: string) {
  if (reason === "SALE") return "Продажа";
  if (reason === "RETURN") return "Возврат";
  return "Ручная корректировка";
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  await requireAdminUser();

  const resolvedSearchParams = (await searchParams) ?? {};
  const revenuePeriod = parseRevenuePeriod(resolvedSearchParams.period);
  const revenueStartDate = getRevenueStartDate(revenuePeriod);

  const [
    newOrders,
    totalOrders,
    revenue,
    activeProducts,
    hiddenProducts,
    lowStockProducts,
    recentOrders,
    missingImageProducts,
    recentStockMovements,
  ] = await Promise.all([
    prisma.order.count({ where: { fulfillmentStatus: "NEW" } }),
    prisma.order.count(),
    prisma.order.aggregate({
      where: {
        paymentStatus: "SUCCEEDED",
        ...(revenueStartDate ? { createdAt: { gte: revenueStartDate } } : {}),
      },
      _sum: { totalPrice: true },
    }),
    prisma.product.count({ where: { isPublished: true } }),
    prisma.product.count({ where: { isPublished: false } }),
    prisma.product.count({ where: { stock: { lte: 10, not: null } } }),
    prisma.order.findMany({
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        fulfillmentStatus: true,
        totalPrice: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.product.count({
      where: { OR: [{ mainImageUrl: null }, { mainImageUrl: "" }] },
    }),
    prisma.inventoryMovement.findMany({
      select: {
        id: true,
        delta: true,
        reason: true,
        note: true,
        createdAt: true,
        product: { select: { name: true } },
        order: { select: { orderNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const revenueTotal = revenue._sum.totalPrice ?? 0;
  const recentOrderItems: RecentOrder[] = recentOrders;
  const notifications = buildAdminNotifications({
    newOrders,
    missingImages: missingImageProducts,
    hiddenProducts,
    lowStockProducts,
  });
  const taskCards = [
    {
      title: "Новые заказы",
      text:
        newOrders > 0
          ? "Проверьте остатки и следующий статус."
          : "Очередь заказов чистая.",
      count: newOrders,
      href: "/admin/orders?status=NEW",
      action: "Открыть очередь",
      tone: newOrders > 0 ? "warning" : "good",
    },
    {
      title: "Низкие остатки",
      text:
        lowStockProducts > 0
          ? "Пополните склад или скройте позиции до поставки."
          : "Критичных остатков нет.",
      count: lowStockProducts,
      href: "/admin/catalog?tab=products&stock=low",
      action: "Проверить остатки",
      tone: lowStockProducts > 0 ? "danger" : "good",
    },
    {
      title: "Карточки без фото",
      text:
        missingImageProducts > 0
          ? "Добавьте главное фото, чтобы товар выглядел надежно на витрине."
          : "У всех товаров есть основные фото.",
      count: missingImageProducts,
      href: "/admin/catalog?tab=products&image=missing",
      action: "Добавить фото",
      tone: missingImageProducts > 0 ? "warning" : "good",
    },
    {
      title: "Скрытые товары",
      text:
        hiddenProducts > 0
          ? "Проверьте, что скрытые позиции действительно не должны продаваться."
          : "Все нужные товары на витрине.",
      count: hiddenProducts,
      href: "/admin/catalog?tab=products&published=hidden",
      action: "Посмотреть товары",
      tone: "neutral",
    },
  ];

  return (
    <AdminShell
      title="Обзор"
      subtitle="Добро пожаловать обратно. Вот как идут дела сегодня."
      primaryAction={{ href: "/admin/catalog/products/new", label: "Новый товар" }}
      notifications={notifications}
    >
      <section className={styles.metrics} data-testid="admin-dashboard-metrics">
        <article className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon} aria-hidden="true">
              ₽
            </span>
            <nav className={styles.periodTabs} aria-label="Период выручки">
              {revenuePeriods.map((period) => (
                <Link
                  key={period.value}
                  href={period.value === "today" ? "/admin" : `/admin?period=${period.value}`}
                  className={period.value === revenuePeriod ? styles.periodTabActive : ""}
                >
                  {period.label}
                </Link>
              ))}
            </nav>
          </div>
          <p>Выручка</p>
          <strong>{formatPrice(revenueTotal)}</strong>
        </article>

        <article className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon} aria-hidden="true">
              +
            </span>
          </div>
          <p>Заказы всего</p>
          <strong>{totalOrders.toLocaleString("ru-RU")}</strong>
        </article>

        <article className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon} aria-hidden="true">
              ◇
            </span>
          </div>
          <p>Активные товары</p>
          <strong>{activeProducts.toLocaleString("ru-RU")}</strong>
        </article>
      </section>

      <section className={styles.taskQueue} aria-label="Задачи администратора">
        <div className={styles.taskQueueHeader}>
          <div>
            <h2>Что требует внимания</h2>
            <p>Быстрые переходы к тем же фильтрам, что используются в заказах и каталоге.</p>
          </div>
          <Link href="/admin/catalog?tab=products">Открыть весь каталог</Link>
        </div>
        <div className={styles.taskGrid}>
          {taskCards.map((task) => (
            <Link
              key={task.title}
              href={task.href}
              className={`${styles.taskCard} ${styles[`task${task.tone}`]}`}
            >
              <span>{task.title}</span>
              <strong>{task.count.toLocaleString("ru-RU")}</strong>
              <p>{task.text}</p>
              <b>{task.action}</b>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.dashboardGrid}>
        <article className={styles.ordersPanel}>
          <div className={styles.panelHeader}>
            <h2>Последние заказы</h2>
            <Link href="/admin/orders">Все заказы</Link>
          </div>

          {recentOrderItems.length === 0 ? (
            <p className={styles.empty}>Заказы пока не найдены.</p>
          ) : (
            <div className={styles.ordersTableWrap}>
              <table className={styles.ordersTable}>
                <thead>
                  <tr>
                    <th>ID заказа</th>
                    <th>Клиент</th>
                    <th>Статус</th>
                    <th>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrderItems.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link className={styles.orderId} href={`/admin/orders?q=${encodeURIComponent(order.orderNumber)}`}>
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td>
                        <span className={styles.customerName}>{order.customerName}</span>
                        <small>
                          {order.createdAt.toLocaleString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[`status${order.fulfillmentStatus}`]}`}>
                          {getAdminOrderStatusLabel(order.fulfillmentStatus)}
                        </span>
                      </td>
                      <td>{formatPrice(order.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      <section className={styles.stockMovementsPanel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Последние движения остатков</h2>
            <p>Продажи и ручные корректировки записываются автоматически.</p>
          </div>
          <Link href="/admin/catalog?tab=products">Открыть каталог</Link>
        </div>
        {recentStockMovements.length === 0 ? (
          <p className={styles.empty}>Движений по складу пока нет.</p>
        ) : (
          <ul className={styles.stockMovementList}>
            {recentStockMovements.map((movement) => (
              <li key={movement.id}>
                <div>
                  <strong>{movement.product.name}</strong>
                  <span>
                    {getInventoryReasonLabel(movement.reason)}
                    {movement.order ? ` · заказ ${movement.order.orderNumber}` : ""}
                    {movement.note ? ` · ${movement.note}` : ""}
                  </span>
                </div>
                <div className={movement.delta < 0 ? styles.stockDeltaNegative : styles.stockDeltaPositive}>
                  <strong>
                    {movement.delta > 0 ? "+" : ""}
                    {movement.delta}
                  </strong>
                  <time dateTime={movement.createdAt.toISOString()}>
                    {movement.createdAt.toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
