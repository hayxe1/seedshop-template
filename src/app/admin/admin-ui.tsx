import type { ReactNode } from "react";
import styles from "./admin-ui.module.css";

type NoticeTone = "success" | "error" | "warning";
type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export function AdminNotice({
  tone,
  children,
  testId,
}: {
  tone: NoticeTone;
  children: ReactNode;
  testId?: string;
}) {
  const toneClass =
    tone === "success"
      ? styles.noticeSuccess
      : tone === "error"
        ? styles.noticeError
        : styles.noticeWarning;

  return (
    <p className={`${styles.notice} ${toneClass}`} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      {children}
    </p>
  );
}

export function AdminEmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function AdminStatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? styles.statusSuccess
      : tone === "warning"
        ? styles.statusWarning
        : tone === "danger"
          ? styles.statusDanger
          : tone === "info"
            ? styles.statusInfo
            : "";

  return <span className={`${styles.statusBadge} ${toneClass}`.trim()}>{children}</span>;
}
