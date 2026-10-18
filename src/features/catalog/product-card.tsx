import ProductImage from "@/shared/ui/product-image";
import { CatalogProductLink } from "@/shared/ui/catalog-position";
import type { CatalogProduct } from "@/entities/product/model/catalog-data";
import AddToCartButton from "@/features/cart/add-to-cart-button";
import styles from "./product-card.module.css";

type ProductCardProps = {
  product: CatalogProduct;
  loading?: "eager" | "lazy";
  returnTo?: string;
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
  return "Можно заказать";
}

export default function ProductCard({ product, loading, returnTo }: ProductCardProps) {
  const href = `/product/${product.slug}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  return (
    <article className={styles.card} data-product-slug={product.slug}>
      <CatalogProductLink href={href} returnTo={returnTo} slug={product.slug} className={styles.imageWrap}>
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className={styles.image}
          width={product.imageWidth}
          height={product.imageHeight}
          sizes="(max-width: 640px) 50vw, (max-width: 980px) 50vw, 25vw"
          loading={loading}
        />
      </CatalogProductLink>

      <div className={styles.cardTop}>
        <span className={styles.category}>{product.category}</span>
        {product.isNew ? <span className={styles.badge}>Новинка</span> : null}
        <span className={product.isAvailable ? styles.availableBadge : styles.unavailableBadge}>
          {getAvailabilityLabel(product)}
        </span>
      </div>

      <h2 className={styles.cardTitle}>
        <CatalogProductLink href={href} returnTo={returnTo} slug={product.slug} className={styles.cardTitleLink}>
          {product.name}
        </CatalogProductLink>
      </h2>

      <p className={styles.packLabel}>{product.packLabel === "Фасовка уточняется" ? product.packLabel : `Фасовка: ${product.packLabel}`}</p>

      <p className={styles.cardDescription}>{product.shortDescription}</p>

      <div className={styles.cardBottom}>
        <div>
          <strong className={styles.price}>{product.price} ₽</strong>
          <span className={styles.priceUnit}>за единицу</span>
        </div>
        <div className={styles.cardActions}>
          <AddToCartButton
            item={{
              productId: product.id,
              slug: product.slug,
              name: product.name,
              category: product.category,
              price: product.price,
              imageUrl: product.imageUrl,
              stock: product.inventoryPolicy === "TRACKED" ? product.stock ?? 0 : null,
              inventoryPolicy: product.inventoryPolicy,
            }}
            className={styles.cardBtn}
            disabled={!product.isAvailable}
          />
          <CatalogProductLink href={href} returnTo={returnTo} slug={product.slug} className={styles.detailsLink}>
            Подробнее
          </CatalogProductLink>
        </div>
      </div>
    </article>
  );
}
