"use client";

import { useSyncExternalStore } from "react";
import {
  getServerAnalyticsConsent,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  subscribeAnalyticsConsent,
  type AnalyticsConsent,
} from "./client";
import styles from "./analytics-provider.module.css";

export function AnalyticsConsentControls() {
  const consent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    readAnalyticsConsent,
    getServerAnalyticsConsent
  );

  const save = (value: Exclude<AnalyticsConsent, "unknown">) => {
    saveAnalyticsConsent(value);
    window.location.reload();
  };

  return (
    <div>
      <p>
        Текущая настройка:{" "}
        <strong>
          {consent === "accepted"
            ? "аналитика разрешена"
            : consent === "declined"
              ? "аналитика запрещена"
              : "выбор ещё не сделан"}
        </strong>
        .
      </p>
      <div className={styles.actions}>
        <button type="button" onClick={() => save("declined")}>
          Запретить аналитику
        </button>
        <button
          type="button"
          className={styles.accept}
          onClick={() => save("accepted")}
        >
          Разрешить аналитику
        </button>
      </div>
    </div>
  );
}
