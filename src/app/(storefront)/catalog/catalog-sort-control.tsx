"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CatalogSort } from "@/entities/product/model/catalog-data";
import styles from "./catalog.module.css";

type SortOption = {
  value: CatalogSort;
  label: string;
};

type CatalogSortControlProps = {
  value: CatalogSort;
  options: SortOption[];
};

export default function CatalogSortControl({ value, options }: CatalogSortControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selectedLabel =
    options.find((option) => option.value === selectedValue)?.label ?? options[0]?.label ?? "";

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleMenu = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen) {
      requestAnimationFrame(() => {
        rootRef.current?.querySelector<HTMLInputElement>('input[name="sort"]:checked')?.focus();
      });
    }
  };

  const selectOption = (nextValue: CatalogSort) => {
    setSelectedValue(nextValue);
    setIsOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div ref={rootRef} className={styles.sortControl}>
      <span className={styles.sortControlLabel}>Сортировка товаров</span>
      <button
        ref={triggerRef}
        type="button"
        className={styles.sortTrigger}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={`Сортировка товаров: ${selectedLabel}`}
        onClick={toggleMenu}
      >
        <span>{selectedLabel}</span>
        <span className={styles.sortChevron} aria-hidden="true" />
      </button>

      <div
        id={menuId}
        className={styles.sortMenu}
        role="radiogroup"
        aria-label="Сортировка товаров"
        hidden={!isOpen}
      >
        {options.map((option) => {
          const isSelected = selectedValue === option.value;
          return (
            <label
              key={option.value}
              className={`${styles.sortOption} ${isSelected ? styles.sortOptionSelected : ""}`}
            >
              <input
                type="radio"
                name="sort"
                value={option.value}
                checked={isSelected}
                onChange={() => selectOption(option.value)}
              />
              <span className={styles.sortRadio} aria-hidden="true" />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
