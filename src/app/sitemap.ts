import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const DEPRECATED_VEGETABLES_CATEGORY_SLUG = "ovoshchi";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  const [categories, products, seedSets] = await Promise.all([
    prisma.category.findMany({
      where: {
        slug: {
          not: DEPRECATED_VEGETABLES_CATEGORY_SLUG,
        },
        products: {
          some: {
            isPublished: true,
          },
        },
      },
      select: {
        slug: true,
      },
    }),
    prisma.product.findMany({
      where: {
        isPublished: true,
      },
      select: {
        slug: true,
        updatedAt: true,
        mainImageUrl: true,
        images: {
          select: { url: true },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    prisma.seedSet.findMany({
      where: { isPublished: true, revisions: { some: { role: "PUBLISHED" } } },
      select: {
        slug: true,
        revisions: {
          where: { role: "PUBLISHED" },
          take: 1,
          select: { imageUrl: true, updatedAt: true },
        },
      },
    }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/catalog`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/sets`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/selection`,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${siteUrl}/calendar`,
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: `${siteUrl}/about`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/payment`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/requisites`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/delivery`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/contacts`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/offer`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/privacy`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/faq`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      url: `${siteUrl}/calendar?month=${index + 1}`,
      changeFrequency: "monthly" as const,
      priority: 0.65,
    })),
  ];

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${siteUrl}/catalog/${category.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => {
    const images = Array.from(
      new Set(
        [product.mainImageUrl, ...product.images.map((image) => image.url)].filter(
          (image): image is string => Boolean(image?.trim())
        )
      )
    ).map((image) => new URL(image, `${siteUrl}/`).toString());

    return {
      url: `${siteUrl}/product/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
      ...(images.length ? { images } : {}),
    };
  });

  const seedSetRoutes: MetadataRoute.Sitemap = seedSets.map((seedSet) => {
    const publishedRevision = seedSet.revisions[0];

    return {
      url: `${siteUrl}/sets/${seedSet.slug}`,
      changeFrequency: "weekly",
      priority: 0.7,
      ...(publishedRevision
        ? { lastModified: publishedRevision.updatedAt }
        : {}),
      ...(publishedRevision?.imageUrl
        ? {
            images: [
              new URL(publishedRevision.imageUrl, `${siteUrl}/`).toString(),
            ],
          }
        : {}),
    };
  });

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...seedSetRoutes];
}
