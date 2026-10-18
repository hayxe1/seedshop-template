import Image from "next/image";
import Link from "next/link";
import type { CatalogSeedSet } from "@/entities/product/model/catalog-data";
import AddSeedSetToCartButton from "@/features/cart/add-seed-set-to-cart-button";
import styles from "./seed-set-detail.module.css";

type SeedSetDetailProps = {
  seedSet: CatalogSeedSet;
  preview?: boolean;
};

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export default function SeedSetDetail({ seedSet, preview = false }: SeedSetDetailProps) {
  const savings = Math.max(0, seedSet.itemsTotalPrice - seedSet.price);
  const coverItems = seedSet.items.filter((item) => item.imageUrl).slice(0, 4);
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
    <main className={styles.page}>
      {preview ? (
        <div className={styles.previewBanner}>
          <strong>Предпросмотр черновика</strong>
          <span>Покупатели пока не видят эту версию.</span>
          <Link href={`/admin/catalog/sets/${seedSet.id}`}>Вернуться в редактор</Link>
        </div>
      ) : null}

      <section className={styles.hero}>
        <div className={styles.cover}>
          {seedSet.imageUrl ? (
            <Image
              src={seedSet.imageUrl}
              alt={`Набор семян ${seedSet.name}`}
              width={900}
              height={700}
              sizes="(max-width: 900px) 100vw, 56vw"
              className={styles.coverImage}
              priority
            />
          ) : coverItems.length > 0 ? (
            <div className={styles.coverCollage} aria-label="Товары из набора">
              {coverItems.map((item) => (
                <Image
                  key={item.productId}
                  src={item.imageUrl!}
                  alt=""
                  width={260}
                  height={360}
                  sizes="220px"
                />
              ))}
            </div>
          ) : (
            <div className={styles.coverEmpty}>Обложка набора готовится</div>
          )}
        </div>

        <div className={styles.summary}>
          <p className={styles.kicker}>Готовая подборка · {seedSet.items.length} позиций</p>
          <h1>{seedSet.name}</h1>
          <p className={styles.lead}>{seedSet.shortDescription ?? seedSet.description}</p>

          <div className={styles.priceRow}>
            <strong>{formatPrice(seedSet.price)}</strong>
            {savings > 0 ? <del>{formatPrice(seedSet.itemsTotalPrice)}</del> : null}
            {savings > 0 ? <span>Выгода {formatPrice(savings)}</span> : null}
          </div>

          {preview ? (
            <button type="button" className={styles.buyButton} disabled>
              Добавить набор в корзину
            </button>
          ) : (
            <AddSeedSetToCartButton
              seedSet={cartPayload}
              className={styles.buyButton}
              label="Добавить набор в корзину"
              trackDetail
            />
          )}

          <p className={seedSet.isAvailable ? styles.available : styles.unavailable}>
            <span aria-hidden="true" />
            {seedSet.isAvailable
              ? "Все позиции доступны к заказу"
              : "Одна или несколько позиций временно недоступны"}
          </p>
        </div>
      </section>

      <section className={styles.composition} id="composition" aria-labelledby="seed-set-composition-title">
        <div className={styles.compositionTitle}>
          <p>Внутри</p>
          <h2 id="seed-set-composition-title">Состав набора</h2>
        </div>
        <ol className={styles.items}>
          {seedSet.items.map((item, index) => (
            <li key={item.productId}>
              <span className={styles.index}>{index + 1}</span>
              <div className={styles.itemBody}>
                <span className={styles.itemImage}>
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt="" width={88} height={88} sizes="72px" />
                  ) : (
                    <span>{item.name.slice(0, 1)}</span>
                  )}
                </span>
                <div className={styles.itemCopy}>
                  {item.isPublished ? (
                    <Link href={`/product/${item.slug}`}>{item.name}</Link>
                  ) : (
                    <strong>{item.name}</strong>
                  )}
                  <b>{formatPrice(item.price)}</b>
                  <small className={item.isAvailable ? styles.itemAvailable : styles.itemUnavailable}>
                    {item.isAvailable ? item.inventoryPolicy === "PREORDER" || (item.inventoryPolicy === "TRACKED" && (item.stock ?? 0) === 0) ? "Под заказ" : "В наличии" : "Недоступно"}
                  </small>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.selectionCta}>
        <div>
          <p>Нужен другой состав?</p>
          <h2>Подберите семена под свои условия</h2>
        </div>
        <Link href="/selection">Перейти к подбору</Link>
      </section>
    </main>
  );
}
