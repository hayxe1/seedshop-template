"use client";

import { useEffect, useState } from "react";
import { trackProductDetail } from "@/shared/analytics/client";
import { useCart } from "@/shared/cart/cart-context";

type SeedSetCartItem = {
  productId: string;
  slug: string;
  name: string;
  price: number;
  imageUrl?: string | undefined;
  stock?: number | null | undefined;
  inventoryPolicy?: "TRACKED" | "PREORDER" | "UNLIMITED" | undefined;
};

type AddSeedSetToCartButtonProps = {
  seedSet: {
    id: string;
    slug: string;
    name: string;
    price: number;
    imageUrl?: string | null | undefined;
    items: SeedSetCartItem[];
    isAvailable?: boolean | undefined;
  };
  className?: string | undefined;
  label?: string | undefined;
  trackDetail?: boolean | undefined;
};

function getSeedSetImage(seedSet: AddSeedSetToCartButtonProps["seedSet"]) {
  return seedSet.imageUrl ?? seedSet.items.find((item) => item.imageUrl)?.imageUrl;
}

export default function AddSeedSetToCartButton({
  seedSet,
  className,
  label,
  trackDetail = false,
}: AddSeedSetToCartButtonProps) {
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!trackDetail) return;
    trackProductDetail({
      id: `seed-set:${seedSet.id}`,
      name: seedSet.name,
      category: "Готовые наборы",
      price: seedSet.price,
    });
  }, [seedSet.id, seedSet.name, seedSet.price, trackDetail]);

  const handleClick = () => {
    if (seedSet.isAvailable === false) return;
    addItem({
      kind: "seedSet",
      seedSetId: seedSet.id,
      slug: seedSet.slug,
      name: seedSet.name,
      price: seedSet.price,
      imageUrl: getSeedSetImage(seedSet),
      items: seedSet.items.map((item) => ({
        productId: item.productId,
        slug: item.slug,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
        stock: item.stock,
        inventoryPolicy: item.inventoryPolicy,
      })),
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      data-testid="add-seed-set-button"
      disabled={seedSet.isAvailable === false}
    >
      {seedSet.isAvailable === false ? "Временно недоступен" : justAdded ? "Набор добавлен" : label ?? "Купить"}
    </button>
  );
}
