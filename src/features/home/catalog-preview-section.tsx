import Image from "next/image";
import Link from "next/link";
import type { CatalogProduct } from "@/entities/product/model/catalog-data";
import AddToCartButton from "@/features/cart/add-to-cart-button";
import styles from "@/features/home/home.module.css";

type CatalogPreviewSectionProps = {
  products: CatalogProduct[];
};

function getAvailabilityLabel(product: CatalogProduct) {
  if (!product.isAvailable) return "Нет в наличии";
  if (product.inventoryPolicy === "PREORDER" || (product.inventoryPolicy === "TRACKED" && (product.stock ?? 0) === 0)) return "Под заказ";
  if (
    product.inventoryPolicy === "TRACKED" &&
    product.stock !== null &&
    product.stock <= 5
  ) {
    return `Осталось ${product.stock}`;
  }
  return "В наличии";
}

export default function CatalogPreviewSection({ products }: CatalogPreviewSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="catalog-preview-title">
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <div>
            <h2 id="catalog-preview-title">Каталог семян</h2>
          </div>
        </div>

        {products.length === 0 ? (
          <div className={styles.infoPanel}>
            <p>Скоро здесь появятся товары из каталога.</p>
            <Link href="/catalog" className={styles.primaryButton}>
              Перейти в каталог
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.productGrid}>
              {products.map((item) => (
                <article key={item.id} className={styles.productCard} data-testid="home-catalog-preview-card">
                  <Link href={`/product/${item.slug}`} className={styles.productImageWrap} prefetch={false}>
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      width={item.imageWidth}
                      height={item.imageHeight}
                      className={styles.productImage}
                      sizes="(max-width: 680px) 50vw, (max-width: 980px) 25vw, 160px"
                      loading="lazy"
                    />
                  </Link>
                  <div className={styles.productBody}>
                    <span className={styles.badgeNeutral}>{item.category}</span>
                    <h3>
                      <Link href={`/product/${item.slug}`} prefetch={false}>{item.name}</Link>
                    </h3>
                    <div className={styles.productMeta}>
                      <span className={styles.productPack}>{item.packLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          item.isAvailable
                            ? styles.productAvailability
                            : styles.productUnavailable
                        }
                      >
                        {getAvailabilityLabel(item)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.productBottom}>
                    <strong>{item.price} ₽</strong>
                    <AddToCartButton
                      item={{
                        productId: item.id,
                        slug: item.slug,
                        name: item.name,
                        category: item.category,
                        price: item.price,
                        imageUrl: item.imageUrl,
                        stock: item.inventoryPolicy === "TRACKED" ? item.stock ?? 0 : null,
                        inventoryPolicy: item.inventoryPolicy,
                      }}
                      className={styles.productButton}
                    />
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.catalogPreviewActions}>
              <Link href="/catalog" className={styles.primaryButton}>
                Смотреть весь каталог
                <span className={styles.catalogArrow} aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M5 12h14M14 7l5 5-5 5" />
                  </svg>
                </span>
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
