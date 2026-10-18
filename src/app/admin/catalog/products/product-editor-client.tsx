"use client";

/* eslint-disable @next/next/no-img-element -- Admin previews support arbitrary catalog and temporary blob URLs. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  ApiResponseError,
  assetRecordSchema,
  parseApiResponse,
  productRecordSchema,
  productBodySchema,
  type AssetRecord,
  type CategoryRecord,
  type ProductRecord,
} from "@/shared/api/contracts";
import { AdminNotice, AdminStatusBadge } from "../../admin-ui";
import styles from "./product-editor.module.css";
import { useUnsavedChanges } from "@/shared/hooks/use-unsaved-changes";
import { STORE_BRAND } from "@/shared/config/store";
import { useEditorDraft } from "@/shared/hooks/use-editor-draft";
import EditorDraftNotice from "../../editor-draft-notice";

type ProductForm = {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  price: string;
  mainImageUrl: string;
  plantingTips: string;
  categoryId: string;
  isPublished: boolean;
  isPopularToday: boolean;
  isNew: boolean;
  seoTitle: string;
  seoDescription: string;
  stock: string;
  inventoryPolicy: ProductRecord["inventoryPolicy"];
  manufacturer: string;
  packSize: string;
  growingPlaces: string;
  difficulty: "" | NonNullable<ProductRecord["difficulty"]>;
  maturityDays: string;
  sowMonths: number[];
  transplantMonths: number[];
  harvestMonths: number[];
  lightRequirement: "" | NonNullable<ProductRecord["lightRequirement"]>;
  regionTags: string;
  images: { url: string; position: number }[];
};

type LocalUploadPreview = {
  id: string;
  file: File;
  name: string;
  size: number;
  status: "uploading" | "uploaded" | "failed";
  url: string;
  uploadedUrl?: string;
  error?: string;
};

type ProductEditorMode = "create" | "edit";

type ProductEditorPageProps = {
  mode: ProductEditorMode;
  product: ProductRecord | null;
  categories: CategoryRecord[];
  assets: AssetRecord[];
};

const catalogHref = "/admin/catalog?tab=products";
const allowedUploadTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const productDraftSchema = productBodySchema.required().extend({
  price: z.string(), stock: z.string(), maturityDays: z.string(),
  growingPlaces: z.string(), regionTags: z.string(),
  difficulty: z.enum(["", "BEGINNER", "INTERMEDIATE", "EXPERIENCED"]),
  lightRequirement: z.enum(["", "FULL_SUN", "PARTIAL_SHADE", "SHADE"]),
  images: z.array(z.object({ url: z.string(), position: z.number() })),
});

function emptyProductForm(categoryId = ""): ProductForm {
  return {
    name: "",
    slug: "",
    description: "",
    shortDescription: "",
    price: "",
    mainImageUrl: "",
    plantingTips: "",
    categoryId,
    isPublished: true,
    isPopularToday: false,
    isNew: false,
    seoTitle: "",
    seoDescription: "",
    stock: "",
    inventoryPolicy: "TRACKED",
    manufacturer: "",
    packSize: "",
    growingPlaces: "",
    difficulty: "",
    maturityDays: "",
    sowMonths: [],
    transplantMonths: [],
    harvestMonths: [],
    lightRequirement: "",
    regionTags: "",
    images: [],
  };
}

function productToForm(product: ProductRecord): ProductForm {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description,
    shortDescription: product.shortDescription ?? "",
    price: String(product.price),
    mainImageUrl: product.mainImageUrl ?? "",
    plantingTips: product.plantingTips ?? "",
    categoryId: product.categoryId,
    isPublished: product.isPublished,
    isPopularToday: product.isPopularToday,
    isNew: product.isNew,
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
    stock: product.stock === null ? "" : String(product.stock),
    inventoryPolicy: product.inventoryPolicy,
    manufacturer: product.manufacturer ?? "",
    packSize: product.packSize ?? "",
    growingPlaces: product.growingPlaces.join(", "),
    difficulty: product.difficulty ?? "",
    maturityDays: product.maturityDays === null ? "" : String(product.maturityDays),
    sowMonths: product.sowMonths,
    transplantMonths: product.transplantMonths,
    harvestMonths: product.harvestMonths,
    lightRequirement: product.lightRequirement ?? "",
    regionTags: product.regionTags.join(", "),
    images: product.images.map((image, index) => ({
      url: image.url,
      position: image.position ?? index + 1,
    })),
  };
}

function splitList(value: string) {
  return Array.from(new Set(value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean)));
}

function productFormPayload(form: ProductForm) {
  return {
    ...form,
    growingPlaces: splitList(form.growingPlaces),
    regionTags: splitList(form.regionTags),
    difficulty: form.difficulty || null,
    lightRequirement: form.lightRequirement || null,
  };
}

function formatAssetFolder(folder: string) {
  const labels: Record<string, string> = {
    Uploaded: "Загруженные",
  };

  return labels[folder] ?? folder;
}

async function parseResponse<T extends z.ZodType>(response: Response, schema: T) {
  return parseApiResponse(response, schema);
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} КБ`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 4h12l2 2v14H5z" />
      <path d="M8 4v6h8V4" />
      <path d="M8 18h8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 16V5" />
      <path d="m8 9 4-4 4 4" />
      <path d="M20 16.5A4.5 4.5 0 0 1 15.5 21h-7a4.5 4.5 0 0 1-1-8.9A5.5 5.5 0 0 1 18 10.5" />
    </svg>
  );
}

export default function ProductEditorPage({
  mode,
  product,
  categories,
  assets: initialAssets,
}: ProductEditorPageProps) {
  const router = useRouter();
  const isEditing = mode === "edit";
  const [form, setForm] = useState<ProductForm>(() =>
    product ? productToForm(product) : emptyProductForm(categories[0]?.id ?? "")
  );
  const [assetList, setAssetList] = useState<AssetRecord[]>(() => initialAssets);
  const [assetQuery, setAssetQuery] = useState("");
  const [localPreviews, setLocalPreviews] = useState<LocalUploadPreview[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSaveConflict, setHasSaveConflict] = useState(false);
  const localPreviewUrls = useRef<Set<string>>(new Set());
  const [savedForm] = useState(() => JSON.stringify(form));
  const isDirty = JSON.stringify(form) !== savedForm || localPreviews.some(preview => preview.status === "uploading");
  const allowNavigation = useUnsavedChanges(isDirty);
  const editorDraft = useEditorDraft({ key: `seedshop-product-draft:${product?.id ?? "new"}`, form, isDirty, schema: productDraftSchema, setForm });

  const filteredAssets = useMemo(() => {
    const needle = assetQuery.trim().toLowerCase();
    const filtered = needle
      ? assetList.filter((asset) => `${asset.fileName} ${asset.folder}`.toLowerCase().includes(needle))
      : assetList;
    return filtered.slice(0, 42);
  }, [assetList, assetQuery]);

  const stockPercent = useMemo(() => {
    const stock = Number(form.stock);
    if (!Number.isFinite(stock) || stock <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((stock / 400) * 100));
  }, [form.stock]);
  const isUploadingImages = localPreviews.some((preview) => preview.status === "uploading");
  const productReadiness = useMemo(
    () => [
      { key: "name", label: "Название заполнено", passed: form.name.trim().length >= 3 },
      { key: "description", label: "Описание заполнено", passed: form.description.trim().length >= 10 },
      {
        key: "price",
        label: "Цена больше нуля",
        passed: Number.isFinite(Number(form.price)) && Number(form.price) > 0,
      },
      { key: "category", label: "Категория выбрана", passed: Boolean(form.categoryId) },
      { key: "image", label: "Главное фото добавлено", passed: Boolean(form.mainImageUrl.trim()) },
      {
        key: "stock",
        label: form.inventoryPolicy === "TRACKED" ? "Остаток указан" : "Правило наличия выбрано",
        passed:
          form.inventoryPolicy !== "TRACKED" ||
          (form.stock !== "" && Number.isFinite(Number(form.stock)) && Number(form.stock) >= 0),
      },
    ],
    [form.categoryId, form.description, form.inventoryPolicy, form.mainImageUrl, form.name, form.price, form.stock]
  );
  const readyCount = productReadiness.filter((item) => item.passed).length;

  useEffect(() => {
    const previewUrls = localPreviewUrls.current;

    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.clear();
    };
  }, []);

  useEffect(() => {
    setAssetList(initialAssets);
  }, [initialAssets]);

  const applyUploadedAsset = (url: string, shouldSetMain: boolean) => {
    setForm((current) => {
      if (shouldSetMain) {
        return { ...current, mainImageUrl: url };
      }

      if (current.images.some((image) => image.url === url)) {
        return current;
      }

      return {
        ...current,
        images: [...current.images, { url, position: current.images.length + 1 }],
      };
    });
  };

  const updateLocalPreview = (
    previewId: string,
    patch: Pick<LocalUploadPreview, "status"> & Partial<LocalUploadPreview>
  ) => {
    setLocalPreviews((current) =>
      current.map((preview) => (preview.id === previewId ? { ...preview, ...patch } : preview))
    );
  };

  const uploadLocalFiles = async (previews: LocalUploadPreview[]) => {
    for (const [index, preview] of previews.entries()) {
      try {
        const formData = new FormData();
        formData.append("file", preview.file);
        const result = await parseResponse(
          await fetch("/api/admin/assets/product-images", {
            method: "POST",
            body: formData,
          }),
          assetRecordSchema
        );
        const asset = result.data;

        setAssetList((current) => [asset, ...current.filter((item) => item.url !== asset.url)]);
        applyUploadedAsset(asset.url, index === 0);
        updateLocalPreview(preview.id, {
          status: "uploaded",
          uploadedUrl: asset.url,
        });
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : "Не удалось загрузить изображение.";
        updateLocalPreview(preview.id, {
          status: "failed",
          error: message,
        });
        setError(message);
      }
    }
  };

  const addLocalFiles = (fileList: FileList | null) => {
    const selectedFiles = Array.from(fileList ?? []);
    const files = selectedFiles.filter((file) => allowedUploadTypes.has(file.type));
    const hasUnsupportedFiles = selectedFiles.length > files.length;
    if (hasUnsupportedFiles) {
      setError("Можно загружать только JPG, PNG, WEBP или AVIF.");
    }

    if (files.length === 0) {
      return;
    }

    const nextPreviews = files.map((file) => {
      const url = URL.createObjectURL(file);
      localPreviewUrls.current.add(url);

      return {
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        name: file.name,
        size: file.size,
        status: "uploading" as const,
        url,
      };
    });

    setLocalPreviews((current) => [...current, ...nextPreviews]);
    if (!hasUnsupportedFiles) {
      setError(null);
    }
    void uploadLocalFiles(nextPreviews);
  };

  const removeLocalPreview = (previewId: string) => {
    setLocalPreviews((current) => {
      const preview = current.find((item) => item.id === previewId);
      if (preview) {
        URL.revokeObjectURL(preview.url);
        localPreviewUrls.current.delete(preview.url);
      }

      return current.filter((item) => item.id !== previewId);
    });
  };

  const setMainImage = (url: string) => {
    setForm((current) => ({ ...current, mainImageUrl: url }));
  };

  const addGalleryImage = (url: string) => {
    setForm((current) => {
      if (current.images.some((image) => image.url === url)) {
        return current;
      }

      return {
        ...current,
        images: [...current.images, { url, position: current.images.length + 1 }],
      };
    });
  };

  const moveGalleryImage = (index: number, direction: -1 | 1) => {
    setForm((current) => {
      const next = [...current.images];
      const target = index + direction;
      if (target < 0 || target >= next.length) {
        return current;
      }

      const currentImage = next[index];
      const targetImage = next[target];
      if (!currentImage || !targetImage) {
        return current;
      }

      next[index] = targetImage;
      next[target] = currentImage;
      return {
        ...current,
        images: next.map((image, imageIndex) => ({ ...image, position: imageIndex + 1 })),
      };
    });
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isUploadingImages) {
      setError("Дождитесь окончания загрузки изображений.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    setHasSaveConflict(false);

    const endpoint = isEditing && product ? `/api/admin/catalog/products/${product.id}` : "/api/admin/catalog/products";
    const method = isEditing ? "PATCH" : "POST";
    const normalizedForm = productFormPayload(form);
    const payload = isEditing ? normalizedForm : { ...normalizedForm, slug: form.slug.trim() };

    try {
      await parseResponse(
        await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json", ...(product ? { "If-Match": `"${product.updatedAt}"` } : {}) },
          body: JSON.stringify(payload),
        }),
        productRecordSchema
      );
      setNotice(isEditing ? "Товар обновлен." : "Товар создан.");
      editorDraft.clearDraft();
      allowNavigation();
      router.push(`${catalogHref}&saved=${isEditing ? "updated" : "created"}`);
      router.refresh();
    } catch (requestError) {
      setHasSaveConflict(requestError instanceof ApiResponseError && requestError.code === "PRODUCT_EDIT_CONFLICT");
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить товар.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProduct = async () => {
    if (!product || !window.confirm(`Удалить товар «${product.name}»?`)) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      await parseResponse(
        await fetch(`/api/admin/catalog/products/${product.id}`, { method: "DELETE" }),
        z.unknown().optional()
      );
      setNotice("Товар удален.");
      editorDraft.clearDraft();
      allowNavigation();
      router.push(catalogHref);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось удалить товар. Если товар связан с заказами или наборами, снимите его с витрины."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const unpublishProduct = async () => {
    if (!product) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      await parseResponse(
        await fetch(`/api/admin/catalog/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "If-Match": `"${product.updatedAt}"` },
          body: JSON.stringify({ ...productFormPayload(productToForm(product)), isPublished: false }),
        }),
        productRecordSchema
      );
      setNotice("Товар снят с публикации.");
      editorDraft.clearDraft();
      allowNavigation();
      router.push(`${catalogHref}&saved=hidden`);
      router.refresh();
    } catch (requestError) {
      setHasSaveConflict(requestError instanceof ApiResponseError && requestError.code === "PRODUCT_EDIT_CONFLICT");
      setError(requestError instanceof Error ? requestError.message : "Не удалось скрыть товар.");
    } finally {
      setIsSaving(false);
    }
  };

  const title = isEditing ? "Редактирование товара" : "Создание товара";
  const productName = product?.name || form.name || "Новый товар";
  const visibilityLabel = product ? (product.isPublished ? "На витрине" : "Скрыт") : "Ещё не сохранён";
  const saveLabel = isSaving
    ? "Сохраняем..."
    : isUploadingImages
      ? "Загружаем фото..."
    : isEditing
      ? "Сохранить изменения"
      : form.isPublished ? "Создать и опубликовать" : "Создать скрытый товар";
  const canUnpublish =
    Boolean(product) && Boolean(product?._count.orderItems || product?._count.seedSetItems);

  return (
    <form className={styles.editor} onSubmit={saveProduct} inert={isSaving} aria-busy={isSaving}>
      <EditorDraftNotice savedAt={editorDraft.draft?.savedAt} hasConflict={editorDraft.hasConflict} storageError={editorDraft.storageError} onRestore={editorDraft.restoreDraft} onDiscard={editorDraft.discardDraft} />
      <div className={styles.breadcrumbs} aria-label="Навигация">
        <Link href="/admin/catalog?tab=products">Каталог</Link>
        <span aria-hidden="true">/</span>
        <span>{isEditing ? "Товар" : "Новый товар"}</span>
        <span aria-hidden="true">/</span>
        <strong>{productName}</strong>
      </div>

      <div className={styles.headingRow}>
        <div>
          <AdminStatusBadge tone={product?.isPublished ? "success" : "warning"}>{visibilityLabel}</AdminStatusBadge>
          <h1>{title}</h1>
          <p>После сохранения: {form.isPublished ? "будет виден на витрине" : "будет скрыт с витрины"}.</p>
          {product?.isPublished ? <Link href={`/product/${product.slug}`} target="_blank" rel="noopener noreferrer">Открыть на витрине ↗</Link> : null}
          {isDirty ? <p role="status">Есть несохранённые изменения</p> : null}
        </div>
        <div className={styles.topActions}>
          <Link className={styles.secondaryButton} href={catalogHref}>
            Отмена
          </Link>
          <button className={styles.primaryButton} type="submit" disabled={isSaving || isUploadingImages}>
            <SaveIcon />
            <span>{saveLabel}</span>
          </button>
        </div>
      </div>

      {notice ? <AdminNotice tone="success" testId="admin-catalog-notice">{notice}</AdminNotice> : null}
      {error ? <AdminNotice tone="error" testId="admin-catalog-error">{error}</AdminNotice> : null}
      {hasSaveConflict && product ? <p><Link href={`/admin/catalog/products/${product.id}`} target="_blank" rel="noopener noreferrer">Открыть сохранённую версию для сравнения ↗</Link>. Правки в этой форме остаются доступными.</p> : null}

      <div className={styles.formLayout}>
        <div className={styles.mainColumn}>
          <section className={styles.panel}>
            <PanelTitle title="Основное для продажи" />
            <div className={styles.saleFields}>
              <label>
                Название товара
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  required
                  data-testid="admin-product-name"
                />
              </label>
              <label>
                Категория
                <select
                  value={form.categoryId}
                  onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                  required
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Цена за единицу, ₽
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                  required
                  data-testid="admin-product-price"
                />
              </label>
              <label>
                Фасовка одной единицы
                <input
                  value={form.packSize}
                  onChange={(event) => setForm((current) => ({ ...current, packSize: event.target.value }))}
                  placeholder="Например, 20 семян или 0,1 г"
                />
                <small className={styles.fieldHint}>Содержимое одной продаваемой единицы. Неизвестное оставьте пустым.</small>
              </label>
              <label>
                Правило наличия
                <select
                  value={form.inventoryPolicy}
                  onChange={(event) => setForm((current) => ({ ...current, inventoryPolicy: event.target.value as ProductForm["inventoryPolicy"] }))}
                >
                  <option value="TRACKED">Учитывать остаток</option>
                  <option value="PREORDER">Предзаказ</option>
                  <option value="UNLIMITED">Без ограничения</option>
                </select>
              </label>
              {form.inventoryPolicy === "TRACKED" ? (
                <>
                  <label>
                    Количество на складе
                    <div className={styles.stockControl}>
                      <input
                        type="number"
                        min="0"
                        value={form.stock}
                        onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))}
                      />
                      <span>ед.</span>
                    </div>
                  </label>

                  <div className={styles.stockMeter}>
                    <div>
                      <span>Заполненность склада</span>
                      <strong>{stockPercent}%</strong>
                    </div>
                    <progress value={stockPercent} max={100} />
                  </div>
                </>
              ) : (
                <p className={styles.generatedHint}>
                  {form.inventoryPolicy === "PREORDER"
                    ? "Покупатель увидит статус предзаказа, а срок поставки подтвердит менеджер."
                    : "Товар можно заказывать без ограничения по складскому остатку."}
                </p>
              )}

            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Медиафайлы</h2>
              <span>Макс. 5MB</span>
            </div>
            <div className={styles.mediaGrid}>
              <div className={styles.imagePreview}>
                {form.mainImageUrl ? <img src={form.mainImageUrl} alt="" /> : <span>Нет фото</span>}
              </div>
              <LocalImageUpload
                previews={localPreviews}
                onFilesSelected={addLocalFiles}
                onRemove={removeLocalPreview}
              />
            </div>

            <label className={styles.fullWidthField}>
              Главная картинка
              <input
                value={form.mainImageUrl}
                onChange={(event) => setForm((current) => ({ ...current, mainImageUrl: event.target.value }))}
                placeholder="/product-images/..."
              />
            </label>

            <GalleryEditor
              images={form.images}
              onRemove={(index) =>
                setForm((current) => ({
                  ...current,
                  images: current.images.filter((_, imageIndex) => imageIndex !== index),
                }))
              }
              onMove={moveGalleryImage}
            />

            <details className={styles.assetDisclosure}>
              <summary>Выбрать из библиотеки изображений</summary>
              <AssetPicker
                assets={filteredAssets}
                assetQuery={assetQuery}
                setAssetQuery={setAssetQuery}
                onMain={setMainImage}
                onGallery={addGalleryImage}
              />
            </details>
          </section>

          <section className={styles.panel}>
            <PanelTitle title="Описание и адрес страницы" />
            <div className={styles.fieldStack}>


              {isEditing ? (
                <label className={styles.compactField}>
                  Адрес страницы
                  <input
                    value={form.slug}
                    onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                    required
                    data-testid="admin-product-slug"
                  />
                </label>
              ) : (
                <p className={styles.generatedHint}>Адрес страницы создастся автоматически из названия.</p>
              )}

              <label>
                Короткое описание
                <textarea
                  rows={2}
                  value={form.shortDescription}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, shortDescription: event.target.value }))
                  }
                />
              </label>

              <label>
                Описание
                <textarea
                  rows={5}
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  required
                  data-testid="admin-product-description"
                />
              </label>
            </div>
          </section>

          <section className={styles.panel}>
            <PanelTitle title="Характеристики и выращивание" />
            <div className={styles.attributeGrid}>
              <label>
                Производитель
                <input
                  value={form.manufacturer}
                  onChange={(event) => setForm((current) => ({ ...current, manufacturer: event.target.value }))}
                  placeholder="Название бренда или хозяйства"
                />
              </label>

              <label>
                Срок созревания, дней
                <input
                  type="number"
                  min="1"
                  value={form.maturityDays}
                  onChange={(event) => setForm((current) => ({ ...current, maturityDays: event.target.value }))}
                />
              </label>
              <label>
                Уровень опыта
                <select
                  value={form.difficulty}
                  onChange={(event) => setForm((current) => ({ ...current, difficulty: event.target.value as ProductForm["difficulty"] }))}
                >
                  <option value="">Не указан</option>
                  <option value="BEGINNER">Для новичков</option>
                  <option value="INTERMEDIATE">Нужен небольшой опыт</option>
                  <option value="EXPERIENCED">Для опытных садоводов</option>
                </select>
              </label>
              <label>
                Освещение
                <select
                  value={form.lightRequirement}
                  onChange={(event) => setForm((current) => ({ ...current, lightRequirement: event.target.value as ProductForm["lightRequirement"] }))}
                >
                  <option value="">Не указано</option>
                  <option value="FULL_SUN">Яркое солнце</option>
                  <option value="PARTIAL_SHADE">Солнце или полутень</option>
                  <option value="SHADE">Полутень</option>
                </select>
              </label>
            </div>

            <div className={styles.fieldStack}>
              <label>
                Места выращивания
                <input
                  value={form.growingPlaces}
                  onChange={(event) => setForm((current) => ({ ...current, growingPlaces: event.target.value }))}
                  placeholder="Открытый грунт, теплица, балкон"
                />
                <small>Перечислите через запятую — эти значения появятся в фильтрах каталога.</small>
              </label>
              <label>
                Регионы и климатические зоны
                <input
                  value={form.regionTags}
                  onChange={(event) => setForm((current) => ({ ...current, regionTags: event.target.value }))}
                  placeholder="Средняя полоса, Урал, Сибирь"
                />
              </label>
            </div>

            <div className={styles.monthSections}>
              <MonthPicker label="Посев" value={form.sowMonths} onChange={(sowMonths) => setForm((current) => ({ ...current, sowMonths }))} />
              <MonthPicker label="Пересадка" value={form.transplantMonths} onChange={(transplantMonths) => setForm((current) => ({ ...current, transplantMonths }))} />
              <MonthPicker label="Сбор урожая" value={form.harvestMonths} onChange={(harvestMonths) => setForm((current) => ({ ...current, harvestMonths }))} />
            </div>
          </section>

          <section className={styles.panel}>
            <PanelTitle title="Публикация и подборки" />
            <div className={styles.fieldStack}>


              <label>
                Статус видимости
                <select
                  value={form.isPublished ? "published" : "hidden"}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isPublished: event.target.value === "published",
                    }))
                  }
                  data-testid="admin-product-visibility"
                >
                  <option value="published">Опубликован</option>
                  <option value="hidden">Скрыт</option>
                </select>
              </label>

              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={form.isPopularToday}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, isPopularToday: event.target.checked }))
                  }
                  data-testid="admin-product-popular-today"
                />
                Популярно сегодня
              </label>

              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={form.isNew}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, isNew: event.target.checked }))
                  }
                  data-testid="admin-product-new"
                />
                Новинка
              </label>
            </div>
          </section>

          <section className={styles.panel}>
            <PanelTitle title="Дополнительно" />
            <div className={styles.fieldStack}>
              <label>
                Подсказки по посадке
                <textarea
                  rows={3}
                  value={form.plantingTips}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, plantingTips: event.target.value }))
                  }
                />
              </label>
              <SeoFields
                title={form.seoTitle}
                description={form.seoDescription}
                setTitle={(value) => setForm((current) => ({ ...current, seoTitle: value }))}
                setDescription={(value) =>
                  setForm((current) => ({ ...current, seoDescription: value }))
                }
              />
            </div>
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.panel}>
            <PanelTitle title="Готовность карточки" />
            <div className={styles.readinessSummary}>
              <strong>{readyCount}/{productReadiness.length}</strong>
              <span>{readyCount === productReadiness.length ? "Можно публиковать" : "Проверьте пункты ниже"}</span>
            </div>
            <ul className={styles.readinessList}>
              {productReadiness.map((item) => (
                <li key={item.key} className={item.passed ? styles.readyItem : styles.pendingItem}>
                  <span aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ul>
          </section>

          {isEditing ? (
            <section className={styles.panel}>
              <PanelTitle title="Опасная зона" />
              <div className={styles.dangerActions}>
                {canUnpublish ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={unpublishProduct}
                    disabled={isSaving || !product?.isPublished}
                    data-testid="admin-product-unpublish-fallback"
                  >
                    Снять с публикации
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={deleteProduct}
                  disabled={isSaving}
                  data-testid="admin-drawer-delete"
                >
                  Удалить товар
                </button>
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      <div className={styles.bottomBar}>
        <Link className={styles.secondaryButton} href={catalogHref}>
          Отмена
        </Link>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={isSaving || isUploadingImages}
          data-testid="admin-drawer-save"
        >
          <CheckIcon />
          <span>{saveLabel}</span>
        </button>
      </div>
    </form>
  );
}

function PanelTitle({ title }: { title: string }) {
  return (
    <div className={styles.panelTitle}>
      <h2>{title}</h2>
    </div>
  );
}

const shortMonths = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function MonthPicker({ label, value, onChange }: { label: string; value: number[]; onChange: (value: number[]) => void }) {
  const toggleMonth = (month: number) => {
    onChange(
      value.includes(month)
        ? value.filter((item) => item !== month)
        : [...value, month].sort((left, right) => left - right)
    );
  };

  return (
    <fieldset className={styles.monthPicker}>
      <legend>{label}</legend>
      <div>
        {shortMonths.map((monthLabel, index) => {
          const month = index + 1;
          const checked = value.includes(month);
          return (
            <label key={month} className={checked ? styles.monthChecked : undefined}>
              <input type="checkbox" checked={checked} onChange={() => toggleMonth(month)} />
              <span>{monthLabel}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function LocalImageUpload({
  previews,
  onFilesSelected,
  onRemove,
}: {
  previews: LocalUploadPreview[];
  onFilesSelected: (fileList: FileList | null) => void;
  onRemove: (previewId: string) => void;
}) {
  return (
    <div className={styles.uploadBox} data-testid="admin-product-local-upload">
      <label
        className={styles.uploadDropzone}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onFilesSelected(event.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          onChange={(event) => {
            onFilesSelected(event.target.files);
            event.target.value = "";
          }}
          data-testid="admin-product-file-input"
        />
        <span className={styles.uploadIcon}>
          <UploadIcon />
        </span>
        <strong>Нажмите или перетащите файл</strong>
        <span>PNG, JPG, WEBP, AVIF</span>
      </label>

      {previews.length > 0 ? (
        <div className={styles.uploadPreviewGrid}>
          {previews.map((preview) => (
            <article key={preview.id} className={styles.uploadPreviewCard}>
              <img src={preview.url} alt="" />
              <strong title={preview.name}>{preview.name}</strong>
              <span>{formatFileSize(preview.size)}</span>
              <span className={styles.uploadPreviewStatus}>
                {preview.status === "uploading"
                  ? "Загружаем..."
                  : preview.status === "uploaded"
                    ? "Загружено"
                    : preview.error ?? "Ошибка загрузки"}
              </span>
              <button type="button" onClick={() => onRemove(preview.id)}>
                Убрать
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GalleryEditor({
  images,
  onRemove,
  onMove,
}: {
  images: { url: string; position: number }[];
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <div className={styles.subPanel}>
      <h3>Галерея товара</h3>
      {images.length === 0 ? (
        <p className={styles.empty}>Дополнительные изображения не выбраны.</p>
      ) : (
        <ul className={styles.sortableList}>
          {images.map((image, index) => (
            <li key={image.url}>
              <img src={image.url} alt="" />
              <span>{image.url}</span>
              <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0}>
                Выше
              </button>
              <button type="button" onClick={() => onMove(index, 1)} disabled={index === images.length - 1}>
                Ниже
              </button>
              <button type="button" onClick={() => onRemove(index)}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssetPicker({
  assets,
  assetQuery,
  setAssetQuery,
  onMain,
  onGallery,
}: {
  assets: AssetRecord[];
  assetQuery: string;
  setAssetQuery: (value: string) => void;
  onMain: (url: string) => void;
  onGallery: (url: string) => void;
}) {
  return (
    <div className={styles.assetPicker}>
      <div className={styles.assetHeader}>
        <h3>Библиотека изображений</h3>
        <input
          type="search"
          placeholder="Поиск файла"
          value={assetQuery}
          onChange={(event) => setAssetQuery(event.target.value)}
          aria-label="Поиск изображения"
        />
      </div>
      <div className={styles.assetGrid}>
        {assets.map((asset) => (
          <article key={asset.url} className={styles.assetCard}>
            <img src={asset.url} alt="" />
            <strong>{formatAssetFolder(asset.folder)}</strong>
            <span title={asset.fileName}>{asset.fileName}</span>
            <div>
              <button type="button" onClick={() => onMain(asset.url)} data-testid="admin-asset-select-main">
                Главная
              </button>
              <button type="button" onClick={() => onGallery(asset.url)}>
                В галерею
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
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
          placeholder="Например, Томат Санька — купить семена"
          onChange={(event) => setTitle(event.target.value)}
        />
        <small>
          ≈ {title.length + STORE_BRAND.name.length + 3}/60 с брендом · Не добавляйте «| {STORE_BRAND.name}» —
          бренд появится автоматически.
        </small>
      </label>
      <label>
        Описание страницы
        <textarea
          rows={3}
          value={description}
          maxLength={220}
          placeholder="Ключевые особенности сорта, цена, наличие и способ получения."
          onChange={(event) => setDescription(event.target.value)}
        />
        <small>{description.length}/160 · Одна-две естественные продающие фразы.</small>
      </label>
    </div>
  );
}
