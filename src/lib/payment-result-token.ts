import "server-only";
import { createHash, createHmac } from "node:crypto";
import { getOrderAccessSecret } from "@/lib/env";

const ORDER_ACCESS_TTL_DAYS = 180;

export function hashPaymentResultToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createOrderAccessToken(checkoutKey: string) {
  const secret = getOrderAccessSecret();

  if (secret.length < 32) {
    throw new Error("ORDER_ACCESS_SECRET or ADMIN_AUTH_SECRET must contain at least 32 characters.");
  }

  const token = `v1.${createHmac("sha256", secret)
    .update(`order:${checkoutKey}`)
    .digest("base64url")}`;

  return {
    token,
    hash: hashPaymentResultToken(token),
    expiresAt: new Date(Date.now() + ORDER_ACCESS_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}
