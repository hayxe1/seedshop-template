"use client";

/* eslint-disable @next/next/no-img-element -- Admin previews support arbitrary catalog and temporary blob URLs. */

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import {
  categoryRecordSchema,
  parseApiResponse,
  productRecordSchema,
  seedSetRecordSchema,
  stockAdjustmentResultSchema,
  type CategoryRecord,
  type ProductRecord,
  type SeedSetRecord,
} from "@/shared/api/contracts";
import { AdminEmptyState, AdminNotice } from "../admin-ui";
import styles from "./catalog.module.css";
import { STORE_BRAND } from "@/shared/config/store";

type CatalogView = "products" | "categories" | "sets";
type CategoryForm = {
  name: string;
  slug: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
};
type CategoryEditorState = { type: "category"; id: string | null };
type DrawerState = CategoryEditorState | null;

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatSeedSetStatus(seedSet: SeedSetRecord) {
  if (seedSet.publicationStatus === "PUBLISHED") return "Опубликован";
  if (seedSet.publicationStatus === "PUBLISHED_WITH_CHANGES") return "Есть новые правки";
  if (seedSet.publicationStatus === "HIDDEN") return "Снят с публикации";
  return "Черновик";
}

function parsePositiveInt(value: string | null, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function emptyCategoryForm(): CategoryForm {
  return { name: "", slug: "", description: "", seoTitle: "", seoDescription: "" };
}

function categoryToForm(category: CategoryRecord): CategoryForm {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description ?? "",
    seoTitle: category.seoTitle ?? "",
    seoDescription: category.seoDescription ?? "",
  };
}

async function parseResponse<T extends z.ZodType>(response: Response, schema: T) {
  return parseApiResponse(response, schema);
}

export default function CatalogClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryParam = searchParams.get("q") ?? "";
  const query = queryParam;
  const initialView = searchParams.get("tab");
  const catalogRequest = useRef(0);
  const activeView: CatalogView = initialView === "sets" || initialView === "categories" ? initialView : "products";
  const updateCatalogParams = useCallback((changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(pathname + "?" + params.toString(), { scroll: false });
  }, [pathname, router, searchParams]);
  const setActiveView = (view: CatalogView) => updateCatalogParams({ tab: view, page: null });
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [seedSets, setSeedSets] = useState<SeedSetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [notice, setNotice] = useState<string | null>(() => {
    const saved = searchParams.get("saved");
    return saved === "created" ? "Товар создан." : saved === "updated" ? "Товар обновлён." : saved === "hidden" ? "Товар снят с публикации." : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(() => emptyCategoryForm());
  const categoryFilter = searchParams.get("categoryId") ?? "";
  const publishedFilter = searchParams.get("published") ?? "";
  const stockFilter = searchParams.get("stock") ?? "";
  const imageFilter = searchParams.get("image") ?? "";
  const productPage = parsePositiveInt(searchParams.get("page"));
  const setCategoryFilter = (value: string) => updateCatalogParams({ tab: "products", categoryId: value, page: null });
  const setPublishedFilter = (value: string) => updateCatalogParams({ published: value, page: null });
  const setStockFilter = (value: string) => updateCatalogParams({ stock: value, page: null });
  const setImageFilter = (value: string) => updateCatalogParams({ image: value, page: null });
  const setProductPage = useCallback((value: number | ((current: number) => number)) => {
    const page = typeof value === "function" ? value(productPage) : value;
    updateCatalogParams({ page: page > 1 ? String(page) : null });
  }, [productPage, updateCatalogParams]);

  const selectedCategory = useMemo(
    () =>
      drawer?.type === "category"
        ? categories.find((category) => category.id === drawer.id)
        : null,
    [drawer, categories]
  );

  const loadCatalog = useCallback(async () => {
    const requestId = ++catalogRequest.current;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("pageSize", "12");
      params.set("page", String(productPage));
      if (query.trim()) params.set("q", query.trim());
      if (categoryFilter) params.set("categoryId", categoryFilter);
      if (publishedFilter) params.set("published", publishedFilter);
      if (stockFilter) params.set("stock", stockFilter);
      if (imageFilter) params.set("image", imageFilter);

      const [productsResult, categoriesResult, seedSetsResult] = await Promise.all([
        fetch(`/api/admin/catalog/products?${params.toString()}`, { cache: "no-store" }).then((response) =>
          parseResponse(response, z.array(productRecordSchema))
        ),
        fetch("/api/admin/catalog/categories", { cache: "no-store" }).then((response) =>
          parseResponse(response, z.array(categoryRecordSchema))
        ),
        fetch("/api/admin/catalog/seed-sets", { cache: "no-store" }).then((response) =>
          parseResponse(response, z.array(seedSetRecordSchema))
        ),
      ]);

      if (requestId !== catalogRequest.current) return;
      setProducts(productsResult.data);
      setProductTotal(productsResult.meta?.total ?? productsResult.data.length);
      const nextCategories = categoriesResult.data;
      setCategories(nextCategories);
      setSeedSets(seedSetsResult.data);
    } catch (requestError) {
      if (requestId !== catalogRequest.current) return;
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить каталог.");
    } finally {
      if (requestId === catalogRequest.current) setIsLoading(false);
    }
  }, [categoryFilter, imageFilter, productPage, publishedFilter, query, stockFilter]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (searchParams.get("mode") === "create") {
      if (searchParams.get("tab") === "sets") {
        router.replace("/admin/catalog/sets/new");
        return;
      }

      router.replace("/admin/catalog/products/new");
    }
  }, [router, searchParams]);

  const openCategoryDrawer = (category?: CategoryRecord) => {
    setError(null);
    setNotice(null);
    setCategoryForm(category ? categoryToForm(category) : emptyCategoryForm());
    setDrawer({ type: "category", id: category?.id ?? null });
  };

  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice(null);
    const endpoint =
      drawer?.type === "category" && drawer.id
        ? `/api/admin/catalog/categories/${drawer.id}`
        : "/api/admin/catalog/categories";
    const method = drawer?.type === "category" && drawer.id ? "PATCH" : "POST";

    try {
      await parseResponse(
        await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(categoryForm),
        }),
        categoryRecordSchema
      );
      setNotice(drawer?.id ? "Категория обновлена." : "Категория создана.");
      setDrawer(null);
      await loadCatalog();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить категорию.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteEntity = async () => {
    if (!drawer?.id) return;
    if (!window.confirm("Удалить категорию?")) return;

    const endpoint = `/api/admin/catalog/categories/${drawer.id}`;

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await parseResponse(await fetch(endpoint, { method: "DELETE" }), z.unknown().optional());
      setNotice("Запись удалена.");
      setDrawer(null);
      await loadCatalog();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось удалить запись.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProduct = async (product: ProductRecord) => {
    if (!window.confirm(`Удалить товар «${product.name}»?`)) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await parseResponse(
        await fetch(`/api/admin/catalog/products/${product.id}`, { method: "DELETE" }),
        z.unknown().optional()
      );
      setNotice("Товар удален.");
      await loadCatalog();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось удалить товар. Если товар связан с заказами или наборами, снимите его с витрины через редактор."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCategoryName = categories.find((category) => category.id === categoryFilter)?.name;
  const handleStockSaved = useCallback(
    (productId: string, stock: number, updatedAt: string) => {
      setProducts((current) =>
        current.map((product) =>
          product.id === productId
            ? { ...product, stock, updatedAt }
            : product
        )
      );
    },
    []
  );

  return (
    <div className={styles.page}>
      <section className={styles.catalogHeader}>
        <div className={styles.categoryPills} aria-label="Фильтр каталога">
          <button
            type="button"
            className={activeView === "products" && !categoryFilter ? styles.activePill : ""}
            onClick={() => {
              setCategoryFilter("");
            }}
          >
            Все
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={
                activeView === "products" && categoryFilter === category.id ? styles.activePill : ""
              }
              onClick={() => {
                setCategoryFilter(category.id);
              }}
            >
              {category.name}
            </button>
          ))}
        </div>
        <div className={styles.serviceActions}>
          <button type="button" aria-pressed={activeView === "sets"} onClick={() => setActiveView("sets")}>
            Наборы
          </button>
          <button type="button" onClick={() => setActiveView("categories")}>
            Управление категориями
          </button>
        </div>
      </section>

      {notice ? <AdminNotice tone="success" testId="admin-catalog-notice">{notice}</AdminNotice> : null}
      {error ? <AdminNotice tone="error" testId="admin-catalog-error">{error}</AdminNotice> : null}

      {activeView === "products" ? (
        <ProductsGrid
          products={products}
          total={productTotal}
          isLoading={isLoading}
          title={selectedCategoryName ?? "Все товары"}
          query={query}
          publishedFilter={publishedFilter}
          setPublishedFilter={setPublishedFilter}
          stockFilter={stockFilter}
          setStockFilter={setStockFilter}
          imageFilter={imageFilter}
          setImageFilter={setImageFilter}
          resetFilters={() => updateCatalogParams({ published: null, stock: null, image: null, page: null })}
          currentPage={productPage}
          setCurrentPage={setProductPage}
          deleteProduct={deleteProduct}
          onStockSaved={handleStockSaved}
        />
      ) : null}

      {activeView === "categories" ? (
        <section className={styles.cardsGrid}>
          <div className={styles.managementHeader}>
            <h2>Категории</h2>
            <button type="button" onClick={() => openCategoryDrawer()} data-testid="admin-create-category">
              Новая категория
            </button>
          </div>
          {categories.map((category) => (
            <article key={category.id} className={styles.entityCard} data-testid={`admin-category-card-${category.slug}`}>
              <h2>{category.name}</h2>
              <p>{category.description ?? "Описание не задано."}</p>
              <div className={styles.cardMeta}>
                <span>{category.slug}</span>
                <span>{category._count.products} товаров</span>
              </div>
              <button type="button" onClick={() => openCategoryDrawer(category)} data-testid="admin-category-edit">
                Редактировать
              </button>
            </article>
          ))}
        </section>
      ) : null}

      {activeView === "sets" ? (
        <section className={styles.cardsGrid}>
          <div className={styles.managementHeader}>
            <h2>Наборы</h2>
            <Link href="/admin/catalog/sets/new" className={styles.managementLink} data-testid="admin-create-seed-set">
              Новый набор
            </Link>
          </div>
          {seedSets.map((seedSet) => (
            <article key={seedSet.id} className={styles.entityCard} data-testid={`admin-seed-set-card-${seedSet.slug}`}>
              <span className={`${styles.setStatus} ${styles[`setStatus${seedSet.publicationStatus}`]}`}>
                {formatSeedSetStatus(seedSet)}
              </span>
              <h2>{seedSet.name}</h2>
              <p>{seedSet.shortDescription ?? seedSet.description}</p>
              <div className={styles.cardMeta}>
                <span>{formatPrice(seedSet.price)}</span>
                <span>{seedSet.items.length} товаров</span>
                <span>Готовность {seedSet.readiness.filter((item) => item.passed).length}/{seedSet.readiness.length}</span>
              </div>
              <Link href={`/admin/catalog/sets/${seedSet.id}`} className={styles.entityEditLink} data-testid="admin-seed-set-edit">
                Редактировать
              </Link>
            </article>
          ))}
        </section>
      ) : null}

      {drawer ? (
        <CatalogDrawer
          drawer={drawer}
          categoryForm={categoryForm}
          setCategoryForm={setCategoryForm}
          selectedCategory={selectedCategory}
          isSaving={isSaving}
          onClose={() => setDrawer(null)}
          saveCategory={saveCategory}
          deleteEntity={deleteEntity}
        />
      ) : null}
    </div>
  );
}

function getStockTone(product: ProductRecord) {
  if (product.stock === 0) return "empty";
  if (product.stock !== null && product.stock <= 10) return "low";
  return "good";
}

function getStockLabel(product: ProductRecord) {
  if (product.stock === null) return "Остаток не задан";
  if (product.stock === 0) return "Нет в наличии";
  if (product.stock <= 10) return "Мало на складе";
  return "В наличии";
}

function getVisiblePages(currentPage: number, pageCount: number) {
  const start = Math.max(1, Math.min(currentPage - 1, pageCount - 2));
  const end = Math.min(pageCount, start + 2);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function QuickStockEditor({
  product,
  onSaved,
}: {
  product: ProductRecord;
  onSaved: (productId: string, stock: number, updatedAt: string) => void;
}) {
  const [value, setValue] = useState(String(product.stock ?? 0));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setValue(String(product.stock ?? 0));
  }, [product.stock]);

  const normalizedValue = Math.max(
    0,
    Math.min(1_000_000, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0)
  );
  const changed = normalizedValue !== (product.stock ?? 0);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const result = await parseResponse(
        await fetch(`/api/admin/catalog/products/${product.id}/stock`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stock: normalizedValue,
            note: "Быстрая корректировка из списка товаров",
          }),
        }),
        stockAdjustmentResultSchema
      );
      setValue(String(result.data.stock));
      setMessage(
        result.data.delta === 0
          ? "Без изменений"
          : `${result.data.delta > 0 ? "+" : ""}${result.data.delta}`
      );
      onSaved(result.data.productId, result.data.stock, result.data.updatedAt);
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : "Не удалось сохранить"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.quickStock} onSubmit={save}>
      <span>Быстрый остаток</span>
      <div>
        <button
          type="button"
          onClick={() => setValue(String(Math.max(0, normalizedValue - 1)))}
          aria-label={`Уменьшить остаток ${product.name}`}
        >
          −
        </button>
        <input
          type="number"
          min="0"
          max="1000000"
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={`Остаток ${product.name}`}
        />
        <button
          type="button"
          onClick={() => setValue(String(Math.min(1_000_000, normalizedValue + 1)))}
          aria-label={`Увеличить остаток ${product.name}`}
        >
          +
        </button>
        <button type="submit" disabled={saving || !changed}>
          {saving ? "…" : "Сохранить"}
        </button>
      </div>
      {message ? <small role="status">{message}</small> : null}
    </form>
  );
}

function ProductsGrid({
  products,
  total,
  isLoading,
  title,
  query,
  publishedFilter,
  setPublishedFilter,
  stockFilter,
  setStockFilter,
  imageFilter,
  setImageFilter,
  resetFilters,
  currentPage,
  setCurrentPage,
  deleteProduct,
  onStockSaved,
}: {
  products: ProductRecord[];
  total: number;
  isLoading: boolean;
  title: string;
  query: string;
  publishedFilter: string;
  setPublishedFilter: (value: string) => void;
  stockFilter: string;
  setStockFilter: (value: string) => void;
  imageFilter: string;
  setImageFilter: (value: string) => void;
  resetFilters: () => void;
  currentPage: number;
  setCurrentPage: (page: number | ((page: number) => number)) => void;
  deleteProduct: (product: ProductRecord) => void;
  onStockSaved: (productId: string, stock: number, updatedAt: string) => void;
}) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const activeFilterCount = [publishedFilter, stockFilter, imageFilter].filter(Boolean).length;
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const updateCurrentPage = (nextPage: number | ((page: number) => number)) => {
    const page = typeof nextPage === "function" ? nextPage(safeCurrentPage) : nextPage;
    setCurrentPage(Math.min(pageCount, Math.max(1, page)));
  };
  useEffect(() => {
    if (!isLoading && currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, isLoading, pageCount, setCurrentPage]);
  const currentProducts = products;
  const visiblePages = getVisiblePages(safeCurrentPage, pageCount);
  const filterGroups = [
    {
      label: "Статус",
      value: publishedFilter,
      onChange: setPublishedFilter,
      options: [
        { value: "", label: "Все" },
        { value: "published", label: "На витрине" },
        { value: "hidden", label: "Скрытые" },
      ],
    },
    {
      label: "Остаток",
      value: stockFilter,
      onChange: setStockFilter,
      options: [
        { value: "", label: "Любой" },
        { value: "low", label: "Низкий" },
        { value: "empty", label: "Нулевой" },
        { value: "tracked", label: "Учитывается" },
      ],
    },
    {
      label: "Фото",
      value: imageFilter,
      onChange: setImageFilter,
      options: [
        { value: "", label: "Любые" },
        { value: "present", label: "Есть фото" },
        { value: "missing", label: "Без фото" },
      ],
    },
  ];

  return (
    <section className={styles.catalogSection}>
      <div className={styles.listHeader}>
        <div>
          <h2>{title}</h2>
          <p>
            {isLoading
              ? "Загружаем каталог..."
              : `${total.toLocaleString("ru-RU")} товаров`}
            {query.trim() ? ` по запросу «${query.trim()}»` : ""}
          </p>
        </div>
        <div className={styles.filters}>
          <button
            type="button"
            className={`${styles.filterTrigger} ${activeFilterCount > 0 ? styles.filterTriggerActive : ""}`.trim()}
            aria-expanded={isFiltersOpen}
            onClick={() => setIsFiltersOpen((current) => !current)}
          >
            <span aria-hidden="true" className={styles.filterIcon}>
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4 6h16" />
                <path d="M7 12h10" />
                <path d="M10 18h4" />
              </svg>
            </span>
            <span>Фильтры</span>
            {activeFilterCount > 0 ? <b>{activeFilterCount}</b> : null}
          </button>
          {isFiltersOpen ? (
            <div className={styles.filterPanel}>
              <div className={styles.filterPanelHeader}>
                <strong>Фильтры каталога</strong>
                {activeFilterCount > 0 ? (
                  <button type="button" onClick={resetFilters}>
                    Сбросить
                  </button>
                ) : null}
              </div>
              {filterGroups.map((group) => (
                <fieldset key={group.label} className={styles.filterGroup}>
                  <legend>{group.label}</legend>
                  <div>
                    {group.options.map((option) => (
                      <button
                        key={option.value || "all"}
                        type="button"
                        className={group.value === option.value ? styles.filterOptionActive : ""}
                        aria-pressed={group.value === option.value}
                        onClick={() => group.onChange(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {isLoading ? (
        <AdminEmptyState title="Загружаем каталог">Обновляем товары, категории и наборы.</AdminEmptyState>
      ) : products.length === 0 ? (
        <AdminEmptyState title="Товары не найдены">
          Измените поиск или сбросьте фильтры, чтобы снова увидеть позиции каталога.
        </AdminEmptyState>
      ) : (
          <>
            <div className={styles.productGrid}>
              {currentProducts.map((product) => {
                const stockTone = getStockTone(product);
                const isUnavailable = product.stock === 0;

                return (
                  <article
                    key={product.id}
                    className={`${styles.productCard} ${isUnavailable ? styles.productCardUnavailable : ""}`.trim()}
                    data-testid={`admin-product-card-${product.slug}`}
                  >
                    <div
                      className={`${styles.productImageFrame} ${isUnavailable ? styles.productImageUnavailable : ""}`.trim()}
                    >
                      {product.mainImageUrl ? (
                        <img src={product.mainImageUrl} alt="" />
                      ) : (
                        <span className={styles.productImagePlaceholder}>Нет фото</span>
                      )}
                      <span className={styles.categoryBadge}>{product.category.name}</span>
                      {isUnavailable ? <span className={styles.unavailableLabel}>Нет в наличии</span> : null}
                    </div>
                    <div className={styles.productCardBody}>
                      <div className={styles.productCardTitle}>
                        <div>
                          <h3>{product.name}</h3>
                          <small>{product.category.name}</small>
                        </div>
                        <span>{formatPrice(product.price)}</span>
                      </div>
                      <div className={styles.productMetaRow}>
                        <span className={`${styles.stockBadge} ${styles[`stock${stockTone}`]}`}>
                          {isUnavailable ? "Ожидается" : getStockLabel(product)}
                        </span>
                        <span>{product.stock === null ? "без учета" : `${product.stock} ед.`}</span>
                      </div>
                      {product.inventoryPolicy === "TRACKED" ? (
                        <QuickStockEditor product={product} onSaved={onStockSaved} />
                      ) : null}
                      <div className={styles.productMetaRow}>
                        <span className={`${styles.badge} ${product.isPublished ? "" : styles.badgeMuted}`.trim()}>
                          {product.isPublished ? "На витрине" : "Скрыт"}
                        </span>
                        {product.isPopularToday ? (
                          <span className={styles.badge}>Популярно сегодня</span>
                        ) : null}
                        {product.isNew ? <span className={styles.badge}>Новинка</span> : null}
                      </div>
                    </div>
                    <div className={styles.productCardActions}>
                      <Link href={`/admin/catalog/products/${product.id}`} data-testid="admin-product-edit">
                        Редактировать
                      </Link>
                      <button
                        type="button"
                        className={styles.deleteCardAction}
                        onClick={() => deleteProduct(product)}
                        data-testid="admin-product-delete"
                      >
                        Удалить
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {pageCount > 1 ? (
              <nav className={styles.pagination} aria-label="Пагинация каталога">
                <button
                  type="button"
                  onClick={() => updateCurrentPage((page) => page - 1)}
                  disabled={safeCurrentPage === 1}
                >
                  ‹
                </button>
                {visiblePages.map((page) => (
                  <button
                    key={page}
                    type="button"
                    className={page === safeCurrentPage ? styles.paginationActive : ""}
                    aria-current={page === safeCurrentPage ? "page" : undefined}
                    onClick={() => updateCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => updateCurrentPage((page) => page + 1)}
                  disabled={safeCurrentPage === pageCount}
                >
                  ›
                </button>
              </nav>
            ) : null}
          </>
      )}
    </section>
  );
}

function CatalogDrawer({
  drawer,
  categoryForm,
  setCategoryForm,
  selectedCategory,
  isSaving,
  onClose,
  saveCategory,
  deleteEntity,
}: {
  drawer: Exclude<DrawerState, null>;
  categoryForm: CategoryForm;
  setCategoryForm: React.Dispatch<React.SetStateAction<CategoryForm>>;
  selectedCategory: CategoryRecord | null | undefined;
  isSaving: boolean;
  onClose: () => void;
  saveCategory: (event: FormEvent<HTMLFormElement>) => void;
  deleteEntity: () => void;
}) {
  const title = selectedCategory?.name ?? "Новая категория";

  return (
    <div className={styles.drawerBackdrop} role="presentation">
      <aside className={styles.drawer} aria-label="Редактор каталога">
        <div className={styles.drawerHeader}>
          <div>
            <p className={styles.kicker}>Категория</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Закрыть
          </button>
        </div>
        <CategoryEditor
          drawer={drawer}
          form={categoryForm}
          setForm={setCategoryForm}
          isSaving={isSaving}
          onSubmit={saveCategory}
          onDelete={deleteEntity}
        />
      </aside>
    </div>
  );
}

function CategoryEditor({
  drawer,
  form,
  setForm,
  isSaving,
  onSubmit,
  onDelete,
}: {
  drawer: { type: "category"; id: string | null };
  form: CategoryForm;
  setForm: React.Dispatch<React.SetStateAction<CategoryForm>>;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
}) {
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label>
        Название
        <input
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          required
          data-testid="admin-category-name"
        />
      </label>
      <label>
        Адрес страницы
        <input
          value={form.slug}
          onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
          required
          data-testid="admin-category-slug"
        />
      </label>
      <label>
        Описание
        <textarea
          rows={3}
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({ ...current, description: event.target.value }))
          }
        />
      </label>
      <SeoFields
        title={form.seoTitle}
        description={form.seoDescription}
        setTitle={(value) => setForm((current) => ({ ...current, seoTitle: value }))}
        setDescription={(value) => setForm((current) => ({ ...current, seoDescription: value }))}
      />
      <DrawerActions
        isSaving={isSaving}
        isEditing={Boolean(drawer.id)}
        saveLabel={drawer.id ? "Сохранить категорию" : "Создать категорию"}
        onDelete={onDelete}
      />
    </form>
  );
}

function SeoFields({
  title,
  description,
  setTitle,
  setDescription,
}: {
  title: string;
  description: string;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
}) {
  return (
    <div className={styles.seoBox}>
      <h3>Поисковая оптимизация</h3>
      <label>
        Заголовок страницы
        <input
          value={title}
          maxLength={90}
          placeholder="Например, Томаты — купить семена"
          onChange={(event) => setTitle(event.target.value)}
        />
        <small>
          ≈ {title.length + 20}/60 с брендом · Пишите главный запрос и пользу без
          «| {STORE_BRAND.name}» — бренд добавится автоматически.
        </small>
      </label>
      <label>
        Описание страницы
        <textarea
          rows={3}
          value={description}
          maxLength={220}
          placeholder="Что продаётся, кому подходит и почему стоит перейти в каталог."
          onChange={(event) => setDescription(event.target.value)}
        />
        <small>{description.length}/160 · Одна-две конкретные, продающие фразы без списка ключевых слов.</small>
      </label>
    </div>
  );
}

function DrawerActions({
  isSaving,
  isEditing,
  saveLabel,
  onDelete,
  extraAction,
}: {
  isSaving: boolean;
  isEditing: boolean;
  saveLabel: string;
  onDelete: () => void;
  extraAction?: React.ReactNode;
}) {
  return (
    <div className={styles.drawerActions}>
      <button type="submit" className={styles.primaryAction} disabled={isSaving} data-testid="admin-drawer-save">
        {isSaving ? "Сохраняем..." : saveLabel}
      </button>
      {extraAction}
      {isEditing ? (
        <button
          type="button"
          className={styles.dangerAction}
          onClick={onDelete}
          disabled={isSaving}
          data-testid="admin-drawer-delete"
        >
          Удалить
        </button>
      ) : null}
    </div>
  );
}
