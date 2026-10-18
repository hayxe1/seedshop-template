"use client";

import { useCallback, useEffect, useRef } from "react";

const NAVIGATION_EVENT = "seedshop:before-admin-navigation";
export function confirmAdminNavigation() {
  return window.dispatchEvent(new Event(NAVIGATION_EVENT, { cancelable: true }));
}

export function useUnsavedChanges(isDirty: boolean) {
  const canLeave = useRef(false);
  const allowNavigation = useCallback(() => { canLeave.current = true; }, []);
  useEffect(() => {
    canLeave.current = false;
    if (!isDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (canLeave.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeAction = (event: Event) => {
      if (!canLeave.current && !window.confirm("Есть несохранённые изменения. Уйти без сохранения?")) event.preventDefault();
    };
    const beforeLink = (event: MouseEvent) => {
      if (canLeave.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.href === window.location.href) return;
      const url = new URL(link.href);
      if (!["http:", "https:"].includes(url.protocol) ||
          (url.pathname === location.pathname && url.search === location.search && url.hash)) return;
      if (!window.confirm("Есть несохранённые изменения. Уйти без сохранения?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener(NAVIGATION_EVENT, beforeAction);
    document.addEventListener("click", beforeLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener(NAVIGATION_EVENT, beforeAction);
      document.removeEventListener("click", beforeLink, true);
    };
  }, [isDirty]);
  return allowNavigation;
}
