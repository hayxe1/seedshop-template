"use client";

import ProductImage from "@/shared/ui/product-image";
import { useState } from "react";
import type { CatalogImage } from "@/entities/product/model/catalog-data";
import styles from "./product-page.module.css";

export default function ProductGallery({ images, name }: { images: CatalogImage[]; name: string }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = images[selectedIndex] ?? images[0];

  if (!selected) return null;

  return (
    <div className={styles.gallery}>
      <div className={styles.imageWrap}>
        <ProductImage
          key={selected.url}
          src={selected.url}
          alt={selectedIndex === 0 ? name : `${name}, фото ${selectedIndex + 1}`}
          width={selected.width}
          height={selected.height}
          className={styles.image}
          sizes="(max-width: 900px) calc(100vw - 32px), 560px"
          priority={selectedIndex === 0}
        />
      </div>

      {images.length > 1 ? (
        <div className={styles.thumbnails} role="group" aria-label="Фотографии товара">
          {images.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              className={index === selectedIndex ? styles.thumbnailActive : styles.thumbnail}
              onClick={() => setSelectedIndex(index)}
              aria-label={`Показать фото ${index + 1}`}
              aria-pressed={index === selectedIndex}
            >
              <ProductImage src={image.url} alt="" width={image.width} height={image.height} sizes="72px" compact />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
