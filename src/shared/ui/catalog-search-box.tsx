"use client";

import ProductImage from "@/shared/ui/product-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useId, useRef, useState, type FormEvent } from "react";
import styles from "./storefront-header.module.css";

type SearchSuggestions = {
  products: Array<{ id: string; slug: string; name: string; price: number; imageUrl: string | null; category: string }>;
  categories: Array<{ slug: string; name: string }>;
};

type SuggestionResult = {
  query: string;
  data: SearchSuggestions;
  failed?: boolean;
};

const EMPTY_SUGGESTIONS: SearchSuggestions = { products: [], categories: [] };

type CatalogSearchBoxProps = {
  id: string;
  className?: string | undefined;
  autoFocus?: boolean;
};

export default function CatalogSearchBox({ id, className, autoFocus = false }: CatalogSearchBoxProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestionResult, setSuggestionResult] = useState<SuggestionResult>({
    query: "",
    data: EMPTY_SUGGESTIONS,
  });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const deferredQuery = useDeferredValue(query.trim());
  const listboxId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (deferredQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    fetch(`/api/catalog/suggestions?q=${encodeURIComponent(deferredQuery)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Suggestions unavailable");
        return response.json();
      })
      .then((data: SearchSuggestions) => {
        if (controller.signal.aborted) return;
        setSuggestionResult({ query: deferredQuery, data });
        setOpen(true);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestionResult({ query: deferredQuery, data: EMPTY_SUGGESTIONS, failed: true });
          setOpen(true);
        }
      });

    return () => controller.abort();
  }, [deferredQuery]);

  const suggestions =
    suggestionResult.query === deferredQuery ? suggestionResult.data : EMPTY_SUGGESTIONS;
  const hasCurrentResult = suggestionResult.query === deferredQuery;
  const hasSuggestions = suggestions.products.length > 0 || suggestions.categories.length > 0;
  const allResultsHref = `/catalog?q=${encodeURIComponent(deferredQuery)}`;
  const optionHrefs = [
    ...suggestions.categories.map((category) => `/catalog/${category.slug}`),
    ...suggestions.products.map((product) => `/product/${product.slug}`),
    ...(hasSuggestions ? [allResultsHref] : []),
  ];
  const popupVisible = open && deferredQuery.length >= 2 && hasCurrentResult;
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const submitCatalogSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim();

    setOpen(false);
    setActiveIndex(-1);
    router.push(normalizedQuery ? `/catalog?q=${encodeURIComponent(normalizedQuery)}` : "/catalog");
  };

  return (
    <div
      className={className}
      onFocus={() => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        if (deferredQuery.length >= 2) setOpen(true);
      }}
      onBlur={() => {
        closeTimer.current = setTimeout(() => setOpen(false), 120);
      }}
    >
      <form
        className={styles.searchFormContents}
        action="/catalog"
        method="get"
        role="search"
        aria-label="Поиск по каталогу"
        onSubmit={submitCatalogSearch}
      >
        <label className={styles.searchLabel} htmlFor={id}>Поиск по каталогу</label>
        <input
          id={id}
          className={styles.searchInput}
          type="search"
          name="q"
          placeholder="Найти семена"
          autoComplete="off"
          autoFocus={autoFocus}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setActiveIndex(-1);
              return;
            }

            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && optionHrefs.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => {
                if (event.key === "ArrowDown") return (current + 1) % optionHrefs.length;
                return current <= 0 ? optionHrefs.length - 1 : current - 1;
              });
              return;
            }

            if (event.key === "Enter" && activeIndex >= 0 && optionHrefs[activeIndex]) {
              event.preventDefault();
              const href = optionHrefs[activeIndex];
              setOpen(false);
              setActiveIndex(-1);
              router.push(href);
            }
          }}
          aria-expanded={popupVisible}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={popupVisible ? activeOptionId : undefined}
          aria-haspopup="listbox"
          role="combobox"
        />
        <button className={styles.searchButton} type="submit" aria-label="Найти"><span className={styles.searchIcon} aria-hidden="true" /></button>
      </form>

      {popupVisible ? (
        <div id={listboxId} className={styles.searchSuggestions} role="listbox" aria-label="Подсказки поиска">
          {hasSuggestions ? (
            <>
              {suggestions.categories.map((category, index) => (
                <Link
                  key={category.slug}
                  id={`${listboxId}-option-${index}`}
                  href={`/catalog/${category.slug}`}
                  className={`${styles.categorySuggestion} ${activeIndex === index ? styles.searchSuggestionActive : ""}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  prefetch={false}
                  onFocus={() => setActiveIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span>Категория</span><strong>{category.name}</strong>
                </Link>
              ))}
              {suggestions.products.map((product, productIndex) => {
                const index = suggestions.categories.length + productIndex;
                return (
                <Link
                  key={product.id}
                  id={`${listboxId}-option-${index}`}
                  href={`/product/${product.slug}`}
                  className={`${styles.productSuggestion} ${activeIndex === index ? styles.searchSuggestionActive : ""}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  prefetch={false}
                  onFocus={() => setActiveIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {product.imageUrl ? <ProductImage src={product.imageUrl} alt="" width={42} height={42} sizes="42px" className={styles.searchPlaceholder} compact /> : <span className={styles.searchPlaceholder} />}
                  <span><strong>{product.name}</strong><small>{product.category}</small></span>
                  <b>{product.price.toLocaleString("ru-RU")} ₽</b>
                </Link>
                );
              })}
              <Link
                id={`${listboxId}-option-${optionHrefs.length - 1}`}
                href={allResultsHref}
                className={`${styles.allResultsLink} ${activeIndex === optionHrefs.length - 1 ? styles.searchSuggestionActive : ""}`}
                role="option"
                aria-selected={activeIndex === optionHrefs.length - 1}
                prefetch={false}
                onFocus={() => setActiveIndex(optionHrefs.length - 1)}
                onMouseEnter={() => setActiveIndex(optionHrefs.length - 1)}
              >
                Все результаты по запросу →
              </Link>
            </>
          ) : (
            <div className={styles.noSuggestions} role="option" aria-disabled="true" aria-selected={false}><span role="status">
              {suggestionResult.failed
                ? "Подсказки временно недоступны. Нажмите Enter, чтобы поискать по всему каталогу."
                : "Точных совпадений нет. Нажмите Enter, чтобы поискать по всему каталогу."}
            </span></div>
          )}
        </div>
      ) : null}
    </div>
  );
}
