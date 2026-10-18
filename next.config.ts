import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://mc.yandex.ru",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://mc.yandex.ru",
      "font-src 'self' data:",
      "connect-src 'self' https://mc.yandex.ru https://mc.yandex.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
];

const privateOrderHeaders = [
  {
    key: "Cache-Control",
    value: "private, no-store, max-age=0",
  },
  {
    key: "Referrer-Policy",
    value: "no-referrer",
  },
  {
    key: "X-Robots-Tag",
    value: "noindex, nofollow, noarchive",
  },
];

const previewNoIndexHeaders =
  process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
    ? [
        {
          key: "X-Robots-Tag",
          value: "noindex, nofollow, noarchive",
        },
      ]
    : [];

const nextConfig: NextConfig = {
  distDir: process.env.E2E_NEXT_DIST_DIR?.trim() || ".next",
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders, ...previewNoIndexHeaders],
      },
      {
        source: "/order/:path*",
        headers: privateOrderHeaders,
      },
      {
        source: "/payment/result",
        headers: privateOrderHeaders,
      },
      {
        source: "/api/orders/:path*",
        headers: privateOrderHeaders,
      },
      {
        source: "/api/payment/result/refresh",
        headers: privateOrderHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/catalog/ovoshchi",
        destination: "/catalog",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
