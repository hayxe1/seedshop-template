"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { z } from "zod";

type Draft<T> = { version: 1; base: string; value: T; savedAt: string };

// Editor content only: session drafts never contain buyer contacts or credentials.
export function useEditorDraft<T>({ key, form, isDirty, schema, setForm, onRestore }: {
  key: string; form: T; isDirty: boolean; schema: z.ZodType<T>;
  setForm: Dispatch<SetStateAction<T>>; onRestore?: () => void;
}) {
  const [base, setBase] = useState(() => JSON.stringify(form));
  const [draft, setDraft] = useState<Draft<T> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const cleared = useRef(false);
  useEffect(() => {
    let active = true;
    // Hydrate external storage after the server/client hydration snapshot agrees.
    queueMicrotask(() => {
      if (!active) return;
      try {
        setDraft(null);
        const raw = JSON.parse(sessionStorage.getItem(key) ?? "null");
        const parsed = schema.safeParse(raw?.value);
        if (raw?.version === 1 && typeof raw.base === "string" &&
            typeof raw.savedAt === "string" && Number.isFinite(Date.parse(raw.savedAt)) && parsed.success) {
          setDraft({ version: 1, base: raw.base, value: parsed.data, savedAt: raw.savedAt });
        }
      } catch (error) { if (!(error instanceof SyntaxError)) setStorageError(true); }
      setLoaded(true);
    });
    return () => { active = false; };
  }, [key, schema]);

  useEffect(() => {
    if (!isDirty) {
      cleared.current = false;
      if (loaded && !draft) { try { sessionStorage.removeItem(key); } catch { /* Optional storage. */ } }
      return;
    }
    if (!loaded || cleared.current) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({ version: 1, base, value: form, savedAt: new Date().toISOString() }));
    } catch { queueMicrotask(() => setStorageError(true)); }
  }, [base, draft, form, isDirty, key, loaded]);

  const clearDraft = (savedValue: T = form) => {
    cleared.current = true;
    setBase(JSON.stringify(savedValue));
    setDraft(null);
    try { sessionStorage.removeItem(key); } catch { setStorageError(true); }
  };
  const restoreDraft = () => {
    if (!draft || (isDirty && !window.confirm("Заменить текущие несохранённые правки сохранённым черновиком?"))) return;
    cleared.current = false;
    setForm(draft.value);
    setDraft(null);
    onRestore?.();
  };
  const discardDraft = () => {
    setDraft(null);
    try { sessionStorage.removeItem(key); } catch { setStorageError(true); }
  };
  return { draft, hasConflict: Boolean(draft && draft.base !== base), storageError, restoreDraft, discardDraft, clearDraft };
}
