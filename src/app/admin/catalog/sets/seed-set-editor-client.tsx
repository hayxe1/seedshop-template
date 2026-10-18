"use client";

/* eslint-disable @next/next/no-img-element -- Admin previews support arbitrary catalog and uploaded asset URLs. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { z } from "zod";
import {
  assetRecordSchema,
  parseApiResponse,
  seedSetRecordSchema,
  seedSetBodySchema,
  type AssetRecord,
  type SeedSetPublicationStatus,
  type SeedSetReadinessItem,
  type SeedSetRecord,
} from "@/shared/api/contracts";
import type { SeedSetProductChoice } from "./seed-set-editor-data";
import styles from "./seed-set-editor.module.css";
import { useUnsavedChanges } from "@/shared/hooks/use-unsaved-changes";
import { useEditorDraft } from "@/shared/hooks/use-editor-draft";
import EditorDraftNotice from "../../editor-draft-notice";

type SeedSetEditorMode = "create" | "edit";

type SeedSetForm = {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  price: string;
  seoTitle: string;
  seoDescription: string;
  items: { productId: string; position: number }[];
};

type SeedSetEditorPageProps = {
  mode: SeedSetEditorMode;
  seedSet: SeedSetRecord | null;
  products: SeedSetProductChoice[];
  assets: AssetRecord[];
};

const catalogHref = "/admin/catalog?tab=sets";
const allowedUploadTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const seedSetDraftSchema = seedSetBodySchema.omit({ isPublished: true }).required().extend({
  price: z.string(), items: z.array(z.object({ productId: z.string(), position: z.number() })),
});
const transliteration: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slugifyName(value: string) {
  return value
    .toLowerCase()
    .split("")
    .map((symbol) => transliteration[symbol] ?? symbol)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function emptySeedSetForm(): SeedSetForm {
  return {
    name: "",
    slug: "",
    shortDescription: "",
    description: "",
    imageUrl: "",
    price: "",
    seoTitle: "",
    seoDescription: "",
    items: [],
  };
}

function seedSetToForm(seedSet: SeedSetRecord): SeedSetForm {
  return {
    name: seedSet.name,
    slug: seedSet.slug,
    shortDescription: seedSet.shortDescription ?? "",
    description: seedSet.description,
    imageUrl: seedSet.imageUrl ?? "",
    price: String(seedSet.price),
    seoTitle: seedSet.seoTitle ?? "",
    seoDescription: seedSet.seoDescription ?? "",
    items: seedSet.items.map((item, index) => ({
      productId: item.productId,
      position: item.position ?? index + 1,
    })),
  };
}

function formatPrice(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function getStatusLabel(status: SeedSetPublicationStatus) {
  const labels: Record<SeedSetPublicationStatus, string> = {
    DRAFT: "Черновик",
    PUBLISHED: "Опубликован",
    PUBLISHED_WITH_CHANGES: "Есть неопубликованные изменения",
    HIDDEN: "Снят с публикации",
  };
  return labels[status];
}

function buildReadiness(form: SeedSetForm, products: SeedSetProductChoice[]): SeedSetReadinessItem[] {
  const selected = form.items
    .map((item) => products.find((product) => product.id === item.productId))
    .filter((product): product is SeedSetProductChoice => Boolean(product));

  return [
    { key: "name", label: "Название заполнено", passed: form.name.trim().length >= 3 },
    {
      key: "slug",
      label: "Адрес страницы корректен",
      passed: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim()),
    },
    {
      key: "description",
      label: "Описание заполнено",
      passed: form.description.trim().length >= 10,
    },
    {
      key: "price",
      label: "Цена больше нуля",
      passed: Number.isFinite(Number(form.price)) && Number(form.price) > 0,
    },
    { key: "image", label: "Обложка выбрана", passed: Boolean(form.imageUrl.trim()) },
    { key: "items", label: "В составе есть товары", passed: form.items.length > 0 },
    {
      key: "products",
      label: "Все товары опубликованы",
      passed:
        form.items.length > 0 &&
        selected.length === form.items.length &&
        selected.every((product) => product.isPublished),
    },
  ];
}

async function parseResponse<T extends z.ZodType>(response: Response, schema: T) {
  return parseApiResponse(response, schema);
}

export default function SeedSetEditorPage({
  mode,
  seedSet,
  products,
  assets: initialAssets,
}: SeedSetEditorPageProps) {
  const router = useRouter();
  const [currentSeedSet, setCurrentSeedSet] = useState(seedSet);
  const [form, setForm] = useState<SeedSetForm>(() =>
    seedSet ? seedSetToForm(seedSet) : emptySeedSetForm()
  );
  const [slugTouched, setSlugTouched] = useState(Boolean(seedSet));
  const [isDirty, setIsDirty] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [assets, setAssets] = useState(initialAssets);

  const selectedProducts = useMemo(
    () =>
      form.items
        .map((item) => products.find((product) => product.id === item.productId))
        .filter((product): product is SeedSetProductChoice => Boolean(product)),
    [form.items, products]
  );
  const availableProducts = useMemo(() => {
    const selectedIds = new Set(form.items.map((item) => item.productId));
    const needle = productQuery.trim().toLocaleLowerCase("ru-RU");
    return products
      .filter((product) => !selectedIds.has(product.id))
      .filter((product) =>
        needle
          ? `${product.name} ${product.slug}`.toLocaleLowerCase("ru-RU").includes(needle)
          : true
      )
      .slice(0, 80);
  }, [form.items, productQuery, products]);
  const filteredAssets = useMemo(() => {
    const needle = assetQuery.trim().toLocaleLowerCase("ru-RU");
    return assets
      .filter((asset) =>
        needle
          ? `${asset.fileName} ${asset.folder}`.toLocaleLowerCase("ru-RU").includes(needle)
          : true
      )
      .slice(0, 30);
  }, [assetQuery, assets]);
  const itemsTotalPrice = selectedProducts.reduce((sum, product) => sum + product.price, 0);
  const setPrice = Number(form.price) || 0;
  const savings = Math.max(0, itemsTotalPrice - setPrice);
  const readiness = useMemo(() => buildReadiness(form, products), [form, products]);
  const isReadyToPublish = readiness.every((item) => item.passed);
  const status = currentSeedSet?.publicationStatus ?? "DRAFT";
  const displayStatus = isDirty ? "Есть несохранённые изменения" : getStatusLabel(status);
  const allowNavigation = useUnsavedChanges(isDirty || isUploading);
  const editorDraft = useEditorDraft({ key: `seedshop-set-draft:${currentSeedSet?.id ?? "new"}`, form, isDirty, schema: seedSetDraftSchema, setForm, onRestore: () => setIsDirty(true) });

  const updateForm = (updater: (current: SeedSetForm) => SeedSetForm) => {
    setForm(updater);
    setIsDirty(true);
    setNotice(null);
  };

  const updateName = (name: string) => {
    updateForm((current) => ({
      ...current,
      name,
      ...(!slugTouched && !currentSeedSet?.isSlugLocked ? { slug: slugifyName(name) } : {}),
    }));
  };

  const requestSave = async ({ navigateAfterCreate = true } = {}) => {
    const isNewSeedSet = !currentSeedSet;
    const endpoint = currentSeedSet
      ? `/api/admin/catalog/seed-sets/${currentSeedSet.id}`
      : "/api/admin/catalog/seed-sets";
    const method = currentSeedSet ? "PATCH" : "POST";
    const result = await parseResponse(
      await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
      seedSetRecordSchema
    );

    setCurrentSeedSet(result.data);
    setForm(seedSetToForm(result.data));
    editorDraft.clearDraft(seedSetToForm(result.data));
    setSlugTouched(true);
    setIsDirty(false);

    if (isNewSeedSet && navigateAfterCreate) {
      router.replace(`/admin/catalog/sets/${result.data.id}`);
    }

    return result.data;
  };

  const saveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsWorking(true);
    setError(null);
    setNotice(null);

    try {
      await requestSave();
      setNotice("Черновик сохранён. Витрина не изменилась.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить черновик.");
    } finally {
      setIsWorking(false);
    }
  };

  const publish = async () => {
    setIsWorking(true);
    setError(null);
    setNotice(null);

    try {
      const saved = await requestSave({ navigateAfterCreate: false });
      if (!saved.isReadyToPublish) {
        const missing = saved.readiness.filter((item) => !item.passed).map((item) => item.label);
        setError(`До публикации осталось: ${missing.join(", ")}.`);
        return;
      }

      const result = await parseResponse(
        await fetch(`/api/admin/catalog/seed-sets/${saved.id}/publish`, { method: "POST" }),
        seedSetRecordSchema
      );
      setCurrentSeedSet(result.data);
      setForm(seedSetToForm(result.data));
      setIsDirty(false);
      setNotice("Новая версия опубликована на странице наборов.");
      router.replace(`/admin/catalog/sets/${result.data.id}`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось опубликовать набор.");
    } finally {
      setIsWorking(false);
    }
  };

  const unpublish = async () => {
    if (!currentSeedSet) return;
    setIsWorking(true);
    setError(null);
    setNotice(null);

    try {
      const saved = isDirty ? await requestSave() : currentSeedSet;
      const result = await parseResponse(
        await fetch(`/api/admin/catalog/seed-sets/${saved.id}/unpublish`, { method: "POST" }),
        seedSetRecordSchema
      );
      setCurrentSeedSet(result.data);
      setForm(seedSetToForm(result.data));
      setIsDirty(false);
      setNotice("Набор снят с витрины. Черновик и последняя опубликованная версия сохранены.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось снять набор с публикации.");
    } finally {
      setIsWorking(false);
    }
  };

  const openPreview = async () => {
    const previewWindow = window.open("about:blank", "_blank");
    setIsWorking(true);
    setError(null);
    setNotice(null);

    try {
      const saved = await requestSave();
      const previewUrl = `/sets/preview/${saved.id}`;
      if (previewWindow) {
        previewWindow.location.href = previewUrl;
      } else {
        router.push(previewUrl);
      }
      setNotice("Черновик сохранён и открыт в точном предпросмотре.");
    } catch (requestError) {
      previewWindow?.close();
      setError(requestError instanceof Error ? requestError.message : "Не удалось открыть предпросмотр.");
    } finally {
      setIsWorking(false);
    }
  };

  const deleteSeedSet = async () => {
    if (!currentSeedSet || !window.confirm(`Удалить набор «${currentSeedSet.name}»?`)) return;
    setIsWorking(true);
    setError(null);

    try {
      await parseResponse(
        await fetch(`/api/admin/catalog/seed-sets/${currentSeedSet.id}`, { method: "DELETE" }),
        z.unknown().optional()
      );
      editorDraft.clearDraft();
      allowNavigation();
      router.push(catalogHref);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось удалить набор.");
    } finally {
      setIsWorking(false);
    }
  };

  const uploadCover = async (file: File | undefined) => {
    if (!file) return;
    if (!allowedUploadTypes.has(file.type)) {
      setError("Можно загружать только JPG, PNG, WEBP или AVIF.");
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await parseResponse(
        await fetch("/api/admin/assets/product-images", { method: "POST", body: formData }),
        assetRecordSchema
      );
      setAssets((current) => [result.data, ...current.filter((asset) => asset.url !== result.data.url)]);
      updateForm((current) => ({ ...current, imageUrl: result.data.url }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить обложку.");
    } finally {
      setIsUploading(false);
    }
  };

  const addProduct = () => {
    if (!selectedProductId) return;
    updateForm((current) => ({
      ...current,
      items: [
        ...current.items,
        { productId: selectedProductId, position: current.items.length + 1 },
      ],
    }));
    setSelectedProductId("");
  };

  const moveProduct = (index: number, direction: -1 | 1) => {
    updateForm((current) => {
      const next = [...current.items];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return {
        ...current,
        items: next.map((item, itemIndex) => ({ ...item, position: itemIndex + 1 })),
      };
    });
  };

  const title = mode === "create" && !currentSeedSet ? "Новый набор" : form.name || "Редактирование набора";

  return (
    <form className={styles.editor} onSubmit={saveDraft} inert={isWorking} aria-busy={isWorking}>
      <EditorDraftNotice savedAt={editorDraft.draft?.savedAt} hasConflict={editorDraft.hasConflict} storageError={editorDraft.storageError} onRestore={editorDraft.restoreDraft} onDiscard={editorDraft.discardDraft} />
      <div className={styles.breadcrumbs} aria-label="Навигация">
        <Link href={catalogHref}>Каталог</Link>
        <span>/</span>
        <span>Наборы</span>
        <span>/</span>
        <strong>{title}</strong>
      </div>

      <div className={styles.headingRow}>
        <div>
          <div
            className={`${styles.statusBadge} ${styles[`status${status}`]}`}
            data-testid="admin-seed-set-status"
          >
            <span aria-hidden="true" />
            {displayStatus}
          </div>
          <h1>{mode === "create" && !currentSeedSet ? "Создание набора" : "Редактирование набора"}</h1>
        </div>
        <div className={styles.topActions}>
          <Link className={styles.secondaryButton} href={catalogHref}>Закрыть</Link>
          <button type="button" className={styles.secondaryButton} onClick={openPreview} disabled={isWorking || isUploading}>
            Предпросмотр
          </button>
          <button type="submit" className={styles.secondaryButton} disabled={isWorking || isUploading} data-testid="admin-seed-set-save">
            {isWorking ? "Сохраняем..." : "Сохранить черновик"}
          </button>
          <button type="button" className={styles.primaryButton} onClick={publish} disabled={isWorking || isUploading || !isReadyToPublish} data-testid="admin-seed-set-publish">
            Опубликовать
          </button>
        </div>
      </div>

      {notice ? <p className={styles.success} data-testid="admin-catalog-notice">{notice}</p> : null}
      {error ? <p className={styles.error} data-testid="admin-catalog-error">{error}</p> : null}

      <div className={styles.formLayout}>
        <div className={styles.mainColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div><span>01</span><h2>Основная информация</h2></div>
              <p>Этот текст увидит покупатель на карточке и странице набора.</p>
            </div>
            <div className={styles.fieldGrid}>
              <label className={styles.fullField}>
                Название набора
                <input value={form.name} onChange={(event) => updateName(event.target.value)} data-testid="admin-seed-set-name" placeholder="Например, Салатный сезон" />
              </label>
              <label>
                Адрес страницы
                <input
                  value={form.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    updateForm((current) => ({ ...current, slug: event.target.value.toLowerCase() }));
                  }}
                  disabled={currentSeedSet?.isSlugLocked}
                  data-testid="admin-seed-set-slug"
                />
                <small>{currentSeedSet?.isSlugLocked ? "Адрес зафиксирован после первой публикации." : "Латиница, цифры и дефисы."}</small>
              </label>
              <label>
                Цена набора
                <div className={styles.priceInput}><input type="number" min="0" value={form.price} onChange={(event) => updateForm((current) => ({ ...current, price: event.target.value }))} data-testid="admin-seed-set-price" /><span>₽</span></div>
              </label>
              <label className={styles.fullField}>
                Короткое описание
                <textarea rows={2} value={form.shortDescription} onChange={(event) => updateForm((current) => ({ ...current, shortDescription: event.target.value }))} placeholder="Одна понятная фраза для карточки набора." />
              </label>
              <label className={styles.fullField}>
                Полное описание
                <textarea rows={5} value={form.description} onChange={(event) => updateForm((current) => ({ ...current, description: event.target.value }))} data-testid="admin-seed-set-description" placeholder="Расскажите, для какой задачи и кому подходит набор." />
              </label>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div><span>02</span><h2>Состав набора</h2></div>
              <p>Порядок здесь совпадает с горизонтальным составом на витрине.</p>
            </div>
            <div className={styles.productPicker}>
              <input type="search" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Найти товар по названию" />
              <select aria-label="Товар для добавления в набор" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} data-testid="admin-seed-set-product-select">
                <option value="">Выберите товар</option>
                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}{product.isPublished ? "" : " — скрыт"}</option>
                ))}
              </select>
              <button type="button" onClick={addProduct} disabled={!selectedProductId} data-testid="admin-seed-set-add-product">Добавить</button>
            </div>

            {selectedProducts.length === 0 ? (
              <div className={styles.emptyComposition}><strong>Состав пока пуст</strong><p>Найдите первый товар выше и добавьте его в набор.</p></div>
            ) : (
              <ol className={styles.compositionList}>
                {selectedProducts.map((product, index) => (
                  <li key={product.id}>
                    <span className={styles.position}>{String(index + 1).padStart(2, "0")}</span>
                    <div className={styles.productImage}>
                      {product.mainImageUrl ? <img src={product.mainImageUrl} alt="" /> : <span>{product.name.slice(0, 1)}</span>}
                    </div>
                    <div className={styles.productMeta}>
                      <strong>{product.name}</strong>
                      <small>{formatPrice(product.price)} · {product.isPublished ? "на витрине" : "товар скрыт"}</small>
                    </div>
                    <div className={styles.orderActions}>
                      <button type="button" onClick={() => moveProduct(index, -1)} disabled={index === 0}>Выше</button>
                      <button type="button" onClick={() => moveProduct(index, 1)} disabled={index === selectedProducts.length - 1}>Ниже</button>
                      <button type="button" className={styles.removeButton} onClick={() => updateForm((current) => ({ ...current, items: current.items.filter((item) => item.productId !== product.id).map((item, itemIndex) => ({ ...item, position: itemIndex + 1 })) }))}>Убрать</button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div><span>03</span><h2>Обложка</h2></div>
              <p>Лучше всего работает горизонтальное фото открытой коробки.</p>
            </div>
            <div className={styles.coverWorkspace}>
              <div className={styles.coverPreview}>
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="Предпросмотр обложки набора" />
                ) : selectedProducts.some((product) => product.mainImageUrl) ? (
                  <div className={styles.coverCollage}>
                    {selectedProducts.filter((product) => product.mainImageUrl).slice(0, 4).map((product) => <img key={product.id} src={product.mainImageUrl!} alt="" />)}
                  </div>
                ) : (
                  <div className={styles.coverEmpty}>Здесь появится обложка</div>
                )}
              </div>
              <div className={styles.coverControls}>
                <label className={styles.uploadButton}>
                  {isUploading ? "Загружаем..." : "Загрузить изображение"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void uploadCover(event.target.files?.[0])} disabled={isUploading} />
                </label>
                <label>
                  Или вставьте адрес изображения
                  <input value={form.imageUrl} onChange={(event) => updateForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="/product-images/..." />
                </label>
                {form.imageUrl ? <button type="button" className={styles.textButton} onClick={() => updateForm((current) => ({ ...current, imageUrl: "" }))}>Убрать обложку</button> : null}
              </div>
            </div>

            {assets.length > 0 ? (
              <details className={styles.assetLibrary}>
                <summary>Выбрать из медиатеки</summary>
                <input type="search" value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} placeholder="Поиск по файлам" />
                <div className={styles.assetGrid}>
                  {filteredAssets.map((asset) => (
                    <button type="button" key={asset.url} onClick={() => updateForm((current) => ({ ...current, imageUrl: asset.url }))} className={form.imageUrl === asset.url ? styles.assetSelected : undefined}>
                      <img src={asset.url} alt="" /><span>{asset.fileName}</span>
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
          </section>

          <details className={`${styles.panel} ${styles.seoPanel}`}>
            <summary>SEO-настройки</summary>
            <div className={styles.fieldGrid}>
              <label className={styles.fullField}>
                Заголовок страницы
                <input
                  value={form.seoTitle}
                  maxLength={90}
                  placeholder="Например, Набор для первого огорода — купить семена"
                  onChange={(event) => updateForm((current) => ({ ...current, seoTitle: event.target.value }))}
                />
                <small>≈ {form.seoTitle.length + 20}/60 с брендом · Название магазина добавится автоматически.</small>
              </label>
              <label className={styles.fullField}>
                Описание для поиска
                <textarea
                  rows={3}
                  value={form.seoDescription}
                  maxLength={220}
                  placeholder="Для кого набор, что внутри, выгода и способ получения."
                  onChange={(event) => updateForm((current) => ({ ...current, seoDescription: event.target.value }))}
                />
                <small>{form.seoDescription.length}/160 · Одна-две конкретные продающие фразы.</small>
              </label>
            </div>
          </details>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.readinessCard}>
            <div className={styles.sideHeading}><span>Готовность</span><strong>{readiness.filter((item) => item.passed).length}/{readiness.length}</strong></div>
            <div className={styles.progressTrack}><span style={{ width: `${(readiness.filter((item) => item.passed).length / readiness.length) * 100}%` }} /></div>
            <ul>
              {readiness.map((item) => <li key={item.key} className={item.passed ? styles.readyItem : styles.pendingItem}><span aria-hidden="true" />{item.label}</li>)}
            </ul>
            <p>{isReadyToPublish ? "Набор готов к публикации." : "Сохранить черновик можно в любой момент."}</p>
          </section>

          <section className={styles.priceCard}>
            <span>Экономика набора</span>
            <dl>
              <div><dt>Товары отдельно</dt><dd>{formatPrice(itemsTotalPrice)}</dd></div>
              <div><dt>Цена набора</dt><dd>{formatPrice(setPrice)}</dd></div>
              <div className={styles.savingsRow}><dt>Выгода покупателя</dt><dd>{formatPrice(savings)}</dd></div>
            </dl>
            {setPrice >= itemsTotalPrice && itemsTotalPrice > 0 ? <p className={styles.priceWarning}>Цена набора не ниже суммы отдельных товаров.</p> : null}
          </section>

          {currentSeedSet?.hasPublishedVersion ? (
            <section className={styles.publicationCard}>
              <span>Публикация</span>
              <strong>{getStatusLabel(currentSeedSet.publicationStatus)}</strong>
              {currentSeedSet.publishedAt ? <p>Последняя публикация: {new Date(currentSeedSet.publishedAt).toLocaleString("ru-RU")}</p> : null}
              {currentSeedSet.isPublished ? <Link href={`/sets/${currentSeedSet.slug}`} target="_blank">Открыть на витрине</Link> : null}
              {currentSeedSet.isPublished ? <button type="button" onClick={unpublish} disabled={isWorking}>Снять с публикации</button> : null}
            </section>
          ) : null}

          {currentSeedSet ? (
            <section className={styles.dangerCard}>
              <span>Удаление</span>
              <p>Опубликованные или заказанные наборы безопаснее снимать с витрины.</p>
              <button type="button" onClick={deleteSeedSet} disabled={isWorking} data-testid="admin-seed-set-delete">Удалить набор</button>
            </section>
          ) : null}
        </aside>
      </div>
    </form>
  );
}
