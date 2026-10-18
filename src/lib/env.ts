function normalizeUrl(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    return new URL(withProtocol).toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function getSiteUrl() {
  const candidates = [
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUrl((candidate ?? "").trim());
    if (normalized) {
      return normalized;
    }
  }

  return "http://localhost:3000";
}

export function getAdminAuthSecret() {
  return (process.env.ADMIN_AUTH_SECRET ?? process.env.SECRET_KEY ?? "").trim();
}

export function getOrderAccessSecret() {
  return (process.env.ORDER_ACCESS_SECRET ?? getAdminAuthSecret()).trim();
}

export function getYookassaCredentials() {
  const shopId = (process.env.YOOKASSA_SHOP_ID ?? "").trim();
  const secretKey = (process.env.YOOKASSA_SECRET_KEY ?? "").trim();

  return {
    shopId,
    secretKey,
    isConfigured: Boolean(shopId && secretKey),
  };
}
