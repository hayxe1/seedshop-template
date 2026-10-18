import { getAdminAuthSecret } from "@/lib/env";

const SESSION_COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const textEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

export function getAdminSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getAdminSessionTtlSeconds() {
  return SESSION_TTL_SECONDS;
}

export function hasAdminSessionSecret() {
  return Boolean(getAdminAuthSecret());
}

export async function createAdminSessionToken(adminUserId: string) {
  const secret = getAdminAuthSecret();
  if (!secret) {
    throw new Error("ADMIN_AUTH_SECRET is not configured");
  }

  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `${adminUserId}:${expiresAt}`;
  const signature = await signValue(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyAdminSessionToken(token: string) {
  const secret = getAdminAuthSecret();
  if (!secret || !token) {
    return { valid: false as const };
  }

  const dotIndex = token.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) {
    return { valid: false as const };
  }

  const payload = token.slice(0, dotIndex);
  const providedSignature = token.slice(dotIndex + 1);
  const expectedSignature = await signValue(payload, secret);

  if (providedSignature !== expectedSignature) {
    return { valid: false as const };
  }

  const [adminUserId, expiresRaw] = payload.split(":");
  const expiresAt = Number(expiresRaw);

  if (!adminUserId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { valid: false as const };
  }

  return {
    valid: true as const,
    adminUserId,
    expiresAt,
  };
}
