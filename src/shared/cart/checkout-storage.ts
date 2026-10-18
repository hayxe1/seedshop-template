import { z } from "zod";

export const CHECKOUT_ATTEMPT_STORAGE_KEY = "seed-store-checkout-attempt-v1";
export const PENDING_ORDER_STORAGE_KEY = "seed-store-pending-order-v1";

const attemptSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  key: z.string().regex(/^[A-Za-z0-9:_-]{16,128}$/),
  orderNumber: z.string().optional(),
  orderUrl: z.string().regex(/^\/order\/[A-Za-z0-9_.%~-]+$/).optional(),
});
export type CheckoutAttempt = z.infer<typeof attemptSchema>;
const purchasedItemSchema = z.object({ itemKey: z.string(), quantity: z.number().int().min(1).max(99) });
const pendingSchema = z.object({
  orderNumber: z.string(), orderUrl: z.string(),
  purchasedItems: z.array(purchasedItemSchema).optional(),
});
export type PurchasedItem = z.infer<typeof purchasedItemSchema>;
export function readCheckoutAttempt() {
  try {
    const result = attemptSchema.safeParse(JSON.parse(sessionStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY) ?? "null"));
    return result.success ? result.data : null;
  } catch { return null; }
}
export function saveCheckoutAttempt(attempt: CheckoutAttempt) {
  try { sessionStorage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt)); } catch { /* In-memory retries remain available. */ }
}
export function readPendingOrder() {
  try {
    const result = pendingSchema.safeParse(JSON.parse(localStorage.getItem(PENDING_ORDER_STORAGE_KEY) ?? "null"));
    return result.success ? result.data : null;
  } catch { return null; }
}
