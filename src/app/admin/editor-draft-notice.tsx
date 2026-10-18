"use client";

import styles from "./editor-draft-notice.module.css";

export default function EditorDraftNotice({ savedAt, hasConflict, storageError, onRestore, onDiscard }: {
  savedAt: string | undefined; hasConflict: boolean; storageError: boolean; onRestore: () => void; onDiscard: () => void;
}) {
  if (!savedAt && !storageError) return null;
  return <aside className={styles.notice} aria-label="Локальный черновик">
    {savedAt ? <>
      <p>В этой вкладке остались несохранённые правки от {new Date(savedAt).toLocaleString("ru-RU")}.</p>
      {hasConflict ? <p>Данные на сервере отличаются от исходной версии черновика. После восстановления проверьте поля перед сохранением.</p> : null}
      <div><button type="button" onClick={onRestore}>Восстановить правки</button><button type="button" onClick={onDiscard}>Удалить черновик</button></div>
    </> : null}
    {storageError ? <p role="status">Браузер не разрешил сохранить локальный черновик. Сохраните изменения на сервере перед уходом.</p> : null}
  </aside>;
}
