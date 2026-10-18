import Image from "next/image";
import Link from "next/link";
import type { CatalogSeedSet } from "@/entities/product/model/catalog-data";
import AddSeedSetToCartButton from "@/features/cart/add-seed-set-to-cart-button";
import styles from "./sets.module.css";

type SeedSetCardProps = {
  seedSet: CatalogSeedSet;
};

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export default function SeedSetCard({ seedSet }: SeedSetCardProps) {
  const coverItems = seedSet.items.filter((item) => item.imageUrl).slice(0, 4);
  const visibleItems = seedSet.items.slice(0, 3);
  const hiddenItemsCount = Math.max(0, seedSet.items.length - visibleItems.length);
  const savings = Math.max(0, seedSet.itemsTotalPrice - seedSet.price);
  const cartPayload = {
    id: seedSet.id,
    slug: seedSet.slug,
    name: seedSet.name,
    price: seedSet.price,
    imageUrl: seedSet.imageUrl,
    isAvailable: seedSet.isAvailable,
    items: seedSet.items.map((item) => ({
      productId: item.productId,
      slug: item.slug,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl,
      stock: item.inventoryPolicy === "TRACKED" ? item.stock ?? 0 : null,
      inventoryPolicy: item.inventoryPolicy,
    })),
  };

  return (
    <article className={styles.card}>
      <Link href={`/sets/${seedSet.slug}`} className={styles.cover} aria-label={`Открыть набор «${seedSet.name}»`}>
        {seedSet.imageUrl ? (
          <Image
            src={seedSet.imageUrl}
            alt={`Набор семян ${seedSet.name}`}
            fill
            className={styles.coverImage}
            sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
          />
        ) : coverItems.length > 0 ? (
          <span className={styles.coverCollage}>
            {coverItems.map((item) => (
              <Image key={item.productId} src={item.imageUrl!} alt="" width={220} height={250} />
            ))}
          </span>
        ) : (
          <span className={styles.coverFallback}>{seedSet.name.slice(0, 1)}</span>
        )}
        <span className={styles.coverBadge}>{seedSet.items.length} позиций</span>
      </Link>

      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <div>
            <p className={styles.cardEyebrow}>Готовая подборка</p>
            <h2><Link href={`/sets/${seedSet.slug}`}>{seedSet.name}</Link></h2>
          </div>
          <span className={seedSet.isAvailable ? styles.inStock : styles.outOfStock}>
            {seedSet.isAvailable ? seedSet.items.some((item) => item.inventoryPolicy === "PREORDER" || (item.inventoryPolicy === "TRACKED" && (item.stock ?? 0) === 0)) ? "Под заказ" : "В наличии" : "Недоступен"}
          </span>
        </div>

        <p className={styles.cardDescription}>
          {seedSet.shortDescription || seedSet.description}
        </p>

        <div className={styles.compositionPreview}>
          <p>Что внутри</p>
          <ol>
            {visibleItems.map((item, index) => (
              <li key={item.productId}>
                <span>{index + 1}</span>
                <strong>{item.name}</strong>
              </li>
            ))}
          </ol>
          {hiddenItemsCount > 0 ? (
            <Link href={`/sets/${seedSet.slug}#composition`}>Ещё {hiddenItemsCount} в составе</Link>
          ) : null}
        </div>

        <div className={styles.cardFooter}>
          <div className={styles.priceBlock}>
            <div>
              <strong>{formatPrice(seedSet.price)}</strong>
              {savings > 0 ? <del>{formatPrice(seedSet.itemsTotalPrice)}</del> : null}
            </div>
            {savings > 0 ? <span>Выгода {formatPrice(savings)}</span> : null}
          </div>
          <AddSeedSetToCartButton
            seedSet={cartPayload}
            className={styles.buyButton}
            label="В корзину"
          />
        </div>

        <Link href={`/sets/${seedSet.slug}`} className={styles.detailsLink}>
          Посмотреть весь состав
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
