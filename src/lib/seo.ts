import type { Metadata } from "next";
import { STORE_BRAND } from "@/shared/config/store";

export const SITE_NAME = STORE_BRAND.name;
export const SITE_LOCALE = "ru_RU";

export const CORE_KEYWORDS = [
  "купить семена",
  "купить семена онлайн",
  "заказать семена",
  "интернет-магазин семян",
  "семена овощей",
  "семена цветов",
  "семена зелени",
  "семена для дачи",
  "семена для огорода",
  "семена для теплицы",
  "семена для балкона",
  "наборы семян",
  "семена Воронеж",
  "семена с доставкой по Воронежу",
  SITE_NAME,
];

export const DEFAULT_SOCIAL_IMAGE = {
  url: "/home/hero-garden.webp",
  width: 1440,
  height: 810,
  alt: `Ухоженные грядки с овощами и зеленью — интернет-магазин ${SITE_NAME}`,
};

type SocialImage = {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
};

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  canonical?: string | false;
  keywords?: string[];
  images?: SocialImage[];
  robots?: Metadata["robots"];
};

const SITE_NAME_SUFFIX = new RegExp(
  String.raw`\s*(?:[|·—–-]\s*)?${SITE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\s*$`,
  "iu"
);

export function stripSiteName(title: string) {
  return title.replace(SITE_NAME_SUFFIX, "").trim() || SITE_NAME;
}

export function getAbsoluteTitle(title: string) {
  const cleanTitle = stripSiteName(title);
  return cleanTitle === SITE_NAME ? SITE_NAME : `${cleanTitle} | ${SITE_NAME}`;
}

export function createPageMetadata({
  title,
  description,
  path,
  canonical = path,
  keywords,
  images = [DEFAULT_SOCIAL_IMAGE],
  robots,
}: PageMetadataOptions): Metadata {
  const cleanTitle = stripSiteName(title);
  const socialTitle = getAbsoluteTitle(cleanTitle);

  return {
    title: cleanTitle === SITE_NAME ? { absolute: SITE_NAME } : cleanTitle,
    description,
    ...(keywords?.length ? { keywords } : {}),
    ...(canonical === false ? {} : { alternates: { canonical } }),
    ...(robots ? { robots } : {}),
    openGraph: {
      type: "website",
      locale: SITE_LOCALE,
      siteName: SITE_NAME,
      title: socialTitle,
      description,
      url: path,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images,
    },
  };
}
