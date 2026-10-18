import type { CatalogProduct } from "@/entities/product/model/catalog-data";
import PopularProductsCarousel, {
  type PopularProductCarouselItem,
} from "@/features/home/popular-products-carousel";
import styles from "@/features/home/home.module.css";

type PopularProductsSectionProps = {
  popularProducts: CatalogProduct[];
};

export default function PopularProductsSection({
  popularProducts,
}: PopularProductsSectionProps) {
  if (popularProducts.length === 0) {
    return null;
  }

  const carouselProducts: PopularProductCarouselItem[] = popularProducts.map((item) => ({
    id: item.id,
    slug: item.slug,
    name: item.name,
    category: item.category,
    price: item.price,
    stock: item.stock,
    imageUrl: item.imageUrl,
    imageWidth: item.imageWidth,
    imageHeight: item.imageHeight,
  }));

  return (
    <section className={styles.section} aria-labelledby="popular-today-title">
      <div className={styles.container}>
        <div className={styles.sectionHeadCentered}>
          <h2 id="popular-today-title">Популярно сегодня</h2>
        </div>

        <PopularProductsCarousel products={carouselProducts} />
      </div>
    </section>
  );
}
