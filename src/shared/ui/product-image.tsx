"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import styles from "./product-image.module.css";

// Keep the media slot and product identity when a URL is missing or fails.
export default function ProductImage({ compact = false, ...props }: ImageProps & { compact?: boolean }) {
  const source = typeof props.src === "string" ? props.src : "src" in props.src ? props.src.src : props.src.default.src;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!source || source === "/file.svg" || source === failedSource) {
    return <span className={`${props.className ?? ""} ${styles.fallback} ${compact ? styles.compact : ""}`} role={props.alt ? "img" : undefined} aria-hidden={!props.alt} aria-label={props.alt ? `${props.alt}: фото пока нет` : undefined}>
      <svg viewBox="0 0 32 32" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="5" width="24" height="22" rx="3" /><circle cx="11" cy="12" r="2" /><path d="m5 24 8-8 5 5 5-7 5 6" /></svg>
      {compact ? null : <span>Фото пока нет</span>}
    </span>;
  }
  return <Image {...props} alt={props.alt} onError={() => setFailedSource(source)} />;
}
