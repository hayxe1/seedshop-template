import Link from "next/link";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";
import styles from "../content-page.module.css";

type IconProps = {
  className?: string | undefined;
};

export const metadata: Metadata = createPageMetadata({
  title: "Доставка семян по Воронежу и самовывоз",
  description:
    "Условия получения заказов «Магазина семян»: бесплатный самовывоз и доставка семян по Воронежу. Стоимость и время доставки согласуем заранее.",
  path: "/delivery",
  keywords: ["доставка семян Воронеж", "семена Воронеж", "самовывоз семян Воронеж"],
});

function TruckIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 7h11v9H3V7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 10h3.6L21 13.4V16h-7v-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="2" />
      <path d="M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ClockIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoxIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="m4 7.5 8-4 8 4-8 4-8-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 7.5v9l8 4 8-4v-9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 11.5v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M12 21s7-3.4 7-10V5.8L12 3 5 5.8V11c0 6.6 7 10 7 10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="m6.5 10 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoCircleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 6h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function LeafIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 108 108"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <mask id="delivery-leaf-cutout" maskUnits="userSpaceOnUse">
          <rect width="108" height="108" fill="white" />
          <path
            fill="black"
            d="M84 31H61.5C42.2 31 28.5 44.4 28.5 60.4 28.5 77 40.4 88 58.8 88 77.2 88 90 72.6 90 52.8V31H84Z"
          />
        </mask>
      </defs>
      <path
        fill="currentColor"
        mask="url(#delivery-leaf-cutout)"
        d="M86 16H59.5C30.8 16 14 36.5 14 59.5 14 69.4 17.8 78.2 24.6 84.8L10.2 99.2C7.7 101.7 7.7 105.7 10.2 108.2 12.7 110.7 16.7 110.7 19.2 108.2L33.9 93.5C41.7 98.8 51 101.5 60.4 101.5 84.5 101.5 101 81 101 55V16H86Z"
      />
      <path
        fill="currentColor"
        d="M62.2 35.2 43.8 58.3C42.5 59.9 43.3 62.3 45.4 62.6L62.8 65.2 47.3 83.6C45.7 85.5 48.1 88.1 50.1 86.6L80.2 62.7C82.3 61 81.3 57.6 78.6 57.2L59.9 54.5 72.3 38.4C74.4 35.7 64.4 32.4 62.2 35.2Z"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m13 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MessageIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M5 5h14v10H8l-3 3V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 9h6M9 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function DeliveryPage() {
  return (
    <main className={`${styles.page} ${styles.pageDelivery}`}>
      <div className={styles.container}>
        <section className={styles.hero} aria-labelledby="delivery-title">
          <h1 id="delivery-title" className={styles.title}>
            Доставка семян по Воронежу
          </h1>
          <p className={styles.lead}>
            На старте заказы можно бесплатно забрать самостоятельно или получить с доставкой
            по Воронежу. Для доставки менеджер свяжется с вами после оформления и отдельно
            согласует стоимость и время.
          </p>
        </section>

        <div className={styles.contentGrid}>
          <div className={styles.stack}>
            <section className={styles.panel} aria-labelledby="delivery-zones-title">
              <h2 id="delivery-zones-title" className={styles.panelTitle}>
                <TruckIcon className={styles.icon} />
                Способы получения
              </h2>

              <ul className={styles.list}>
                <li className={styles.iconListItem}>
                  <CheckCircleIcon className={styles.listIcon} />
                  <span>
                    <strong>Самовывоз:</strong> бесплатно, по предварительному согласованию.
                  </span>
                </li>
                <li className={styles.iconListItem}>
                  <CheckCircleIcon className={styles.listIcon} />
                  <span>
                    <strong>По Воронежу:</strong> доставка по адресу после звонка менеджера.
                  </span>
                </li>
                <li className={styles.iconListItem}>
                  <InfoCircleIcon className={`${styles.listIcon} ${styles.listIconInfo}`} />
                  <span>Доставку в другие города России добавим позже.</span>
                </li>
              </ul>
            </section>

            <aside className={styles.softNote}>
              <LeafIcon className={styles.softNoteIcon} />
              <p>Бережно упаковываем каждую семечку для безопасной транспортировки.</p>
            </aside>
          </div>

          <section className={styles.panel} aria-labelledby="delivery-cost-title">
            <h2 id="delivery-cost-title" className={styles.panelTitle}>
              <ClockIcon className={styles.icon} />
              Стоимость и сроки
            </h2>

            <div className={styles.deliveryList}>
              <div className={styles.deliveryRow}>
                <span className={styles.iconBadge}>
                  <BoxIcon />
                </span>
                <div className={styles.deliveryMeta}>
                  <strong>Бесплатный самовывоз</strong>
                  <span>Место и время менеджер сообщает лично после оформления заказа.</span>
                </div>
                <div className={styles.deliveryCost}>
                  <strong>0 ₽</strong>
                  <span>по согласованию</span>
                </div>
              </div>

              <div className={styles.deliveryRow}>
                <span className={`${styles.iconBadge} ${styles.iconBadgeGreen}`}>
                  <TruckIcon />
                </span>
                <div className={styles.deliveryMeta}>
                  <strong>Доставка по Воронежу</strong>
                  <span>Стоимость зависит от адреса и согласуется после оформления.</span>
                </div>
                <div className={styles.deliveryCost}>
                  <strong>отдельно</strong>
                  <span>менеджер свяжется</span>
                </div>
              </div>
            </div>

            <div className={styles.notice}>
              <ShieldIcon className={styles.icon} />
              <span>
                Онлайн оплачиваются товары и упаковка. Доставка по Воронежу оплачивается
                отдельно после согласования с менеджером.
              </span>
            </div>
          </section>
        </div>

        <div className={styles.actions}>
          <Link href="/catalog" className={styles.btnPrimary}>
            Перейти в каталог
            <ArrowRightIcon className={styles.buttonIcon} />
          </Link>
          <Link href="/contacts" className={styles.btnSecondary}>
            Связаться с нами
            <MessageIcon className={styles.buttonIcon} />
          </Link>
        </div>
      </div>
    </main>
  );
}
