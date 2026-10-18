import type { Metadata, Viewport } from "next";
import { getSiteUrl } from "@/lib/env";
import { AnalyticsProvider } from "@/shared/analytics/analytics-provider";
import { CartProvider } from "@/shared/cart/cart-context";
import {
  CORE_KEYWORDS,
  DEFAULT_SOCIAL_IMAGE,
  SITE_LOCALE,
  SITE_NAME,
} from "@/lib/seo";
import "./globals.css";

const defaultTitle = `Купить семена для дачи и огорода | ${SITE_NAME}`;
const defaultDescription =
  "Интернет-магазин семян овощей, зелени и цветов для дачи, теплицы и балкона. Удобный подбор, готовые наборы, заказ без регистрации и доставка по Воронежу.";
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();
const yandexVerification = process.env.YANDEX_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: defaultTitle,
    template: `%s | ${SITE_NAME}`,
  },
  description: defaultDescription,
  keywords: CORE_KEYWORDS,
  openGraph: {
    type: "website",
    locale: SITE_LOCALE,
    siteName: SITE_NAME,
    title: defaultTitle,
    description: defaultDescription,
    url: "/",
    images: [DEFAULT_SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: [DEFAULT_SOCIAL_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification:
    googleVerification || yandexVerification
      ? {
          ...(googleVerification ? { google: googleVerification } : {}),
          ...(yandexVerification ? { yandex: yandexVerification } : {}),
        }
      : undefined,
  applicationName: SITE_NAME,
  category: "shopping",
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2d9a5a",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <CartProvider>{children}</CartProvider>
        <AnalyticsProvider
          metricaId={process.env.NEXT_PUBLIC_YANDEX_METRICA_ID?.trim() ?? ""}
        />
      </body>
    </html>
  );
}
