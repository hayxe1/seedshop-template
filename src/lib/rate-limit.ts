import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult =
  | {
      limited: false;
      remaining: number;
      retryAfterSeconds: 0;
    }
  | {
      limited: true;
      remaining: 0;
      retryAfterSeconds: number;
    };

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimitKey(namespace: string, ...parts: string[]) {
  return `${namespace}:${hashKey(parts.join("|"))}`;
}

export function rateLimitResponse(result: Extract<RateLimitResult, { limited: true }>) {
  return Response.json(
    {
      ok: false,
      code: "RATE_LIMITED",
      error: "Слишком много запросов. Попробуйте позже.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
      },
    }
  );
}

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.windowMs);
  const [bucket] = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "RateLimitBucket" (
      "key", "count", "windowStart", "expiresAt", "createdAt", "updatedAt"
    ) VALUES (
      ${input.key}, 1, ${now}, ${expiresAt}, ${now}, ${now}
    )
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= EXCLUDED."windowStart" THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= EXCLUDED."windowStart" THEN EXCLUDED."windowStart"
        ELSE "RateLimitBucket"."windowStart"
      END,
      "expiresAt" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= EXCLUDED."windowStart" THEN EXCLUDED."expiresAt"
        ELSE "RateLimitBucket"."expiresAt"
      END,
      "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "count", "expiresAt"
  `;

  if (!bucket) {
    throw new Error("Rate limit bucket was not returned.");
  }

  if (bucket.count > input.limit) {
    return {
      limited: true,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000)
      ),
    };
  }

  return {
    limited: false,
    remaining: Math.max(0, input.limit - bucket.count),
    retryAfterSeconds: 0,
  };
}

export async function cleanupExpiredRateLimits() {
  return prisma.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
}
