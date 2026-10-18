import type { MetadataRoute } from "next";
import { STORE_BRAND } from "@/shared/config/store";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: STORE_BRAND.name,
    short_name: STORE_BRAND.shortName,
    description:
      "Интернет-магазин семян овощей, зелени и цветов для дачи, теплицы и балкона.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fcfcfc",
    theme_color: "#2d9a5a",
    lang: "ru",
    categories: ["shopping", "lifestyle"],
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
