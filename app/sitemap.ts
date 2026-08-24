import type { MetadataRoute } from "next";

import { PUBLIC_SITE_ORIGIN, publicLocalizedUrl } from "@/src/modules/public-retail/seo";
import { listPublicSeoProducts } from "@/src/modules/public-retail/seo-inventory";
import type { PublicRetailLocale } from "@/src/modules/public-retail/types";
import { getPublicBlogService } from "@/src/modules/public-blog/server";

export const dynamic = "force-dynamic";

const locales: PublicRetailLocale[] = ["ru", "ro"];
const staticPaths = [
  "/",
  "/catalog",
  "/about",
  "/contacts",
  "/partners",
  "/calculator/cctv",
  "/installation",
  "/guides",
  "/guides/cctv-selection",
  "/blog",
];

function sitemapXmlUrl(path: string, locale: PublicRetailLocale, params: Record<string, string> = {}) {
  // Next 16's metadata serializer writes URL strings verbatim into XML.
  return publicLocalizedUrl(path, locale, params).replaceAll("&", "&amp;");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, blogEntries] = await Promise.all([
    listPublicSeoProducts(),
    getPublicBlogService().sitemap().catch(() => []),
  ]);
  const categoryLastModified = new Map<string, Date>();
  for (const product of products) {
    if (!product.lastModified) continue;
    for (const category of product.categoryPath) {
      const current = categoryLastModified.get(category.slug);
      if (!current || current < product.lastModified) categoryLastModified.set(category.slug, product.lastModified);
    }
  }
  const categorySlugs = new Set(products.flatMap((product) => product.categoryPath.map((category) => category.slug)));
  const localized = (path: string, params: Record<string, string> = {}, lastModified?: Date | null) => locales.map((locale) => ({
    url: sitemapXmlUrl(path, locale, params),
    ...(lastModified ? { lastModified } : {}),
    alternates: {
      languages: {
        ru: sitemapXmlUrl(path, "ru", params),
        ro: sitemapXmlUrl(path, "ro", params),
        "x-default": sitemapXmlUrl(path, "ru", params),
      },
    },
  }));

  return [
    ...staticPaths.flatMap((path) => localized(path)),
    ...[...categorySlugs].sort().flatMap((category) => localized("/catalog", { category }, categoryLastModified.get(category))),
    ...products.flatMap((product) => localized(`/products/${product.slug}`, {}, product.lastModified)),
    ...blogEntries.map((entry) => {
      const available = blogEntries.filter((candidate) => candidate.slug === entry.slug).map((candidate) => candidate.locale);
      const languages = Object.fromEntries([
        ...available.map((locale) => [locale, sitemapXmlUrl(`/blog/${entry.slug}`, locale)]),
        ...(available.includes("ru") ? [["x-default", sitemapXmlUrl(`/blog/${entry.slug}`, "ru")]] : []),
      ]);
      return { url: sitemapXmlUrl(`/blog/${entry.slug}`, entry.locale), lastModified: new Date(entry.lastModified), alternates: { languages } };
    }),
  ];
}

export const sitemapOrigin = PUBLIC_SITE_ORIGIN;
