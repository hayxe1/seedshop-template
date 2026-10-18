import "server-only";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function isScryptPasswordHash(value: string) {
  return value.startsWith(`${SCRYPT_PREFIX}:`);
}

export function adminPasswordNeedsRehash(storedHash: string) {
  return !isScryptPasswordHash(storedHash.trim());
}

export async function hashAdminPassword(password: string) {
  const salt = randomBytes(SCRYPT_SALT_BYTES).toString("base64url");
  const derivedKey = (await scrypt(password, salt, SCRYPT_KEY_LENGTH)) as Buffer;

  return `${SCRYPT_PREFIX}:${salt}:${derivedKey.toString("base64url")}`;
}

export async function verifyAdminPassword(password: string, storedHash: string) {
  const normalizedHash = storedHash.trim();

  if (isScryptPasswordHash(normalizedHash)) {
    const [, salt, encodedHash] = normalizedHash.split(":");

    if (!salt || !encodedHash) {
      return false;
    }

    const expectedHash = Buffer.from(encodedHash, "base64url");
    if (expectedHash.length === 0) {
      return false;
    }

    const incomingHash = (await scrypt(password, salt, expectedHash.length)) as Buffer;
    return safeEqual(incomingHash, expectedHash);
  }

  if (!LEGACY_SHA256_PATTERN.test(normalizedHash)) {
    return false;
  }

  return safeEqual(Buffer.from(sha256(password), "utf8"), Buffer.from(normalizedHash, "utf8"));
}
