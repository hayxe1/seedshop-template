"use client";
import { useState } from "react";

export default function CartQuantityInput({ quantity, name, onChange }: { quantity: number; name: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(quantity));
  const [previousQuantity, setPreviousQuantity] = useState(quantity);
  if (previousQuantity !== quantity) { setPreviousQuantity(quantity); setDraft(String(quantity)); }
  const commit = () => {
    const parsed = Number(draft);
    const next = draft.trim() && Number.isFinite(parsed) ? Math.max(1, Math.min(99, Math.floor(parsed))) : quantity;
    setDraft(String(next));
    onChange(next);
  };
  return <input type="number" inputMode="numeric" min={1} max={99} step={1} value={draft}
    aria-label={`Количество единиц: ${name}`} data-testid="cart-quantity-input"
    onChange={event => { setDraft(event.target.value); const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 99) onChange(value); }}
    onBlur={commit} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} />;
}
