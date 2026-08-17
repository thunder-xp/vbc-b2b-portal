import type { MetadataRoute } from "next";

import { PUBLIC_SITE_ORIGIN, publicLocalizedUrl } from "@/src/modules/public-retail/seo";
import { listPublicSeoProducts } from "@/src/modules/public-retail/seo-inventory";
import type { PublicRetailLocale } from "@/src/modules/public-retail/types";

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
];

function sitemapXmlUrl(path: string, locale: PublicRetailLocale, params: Record<string, string> = {}) {
  // Next 16's metadata serializer writes URL strings verbatim into XML.
  return publicLocalizedUrl(path, locale, params).replaceAll("&", "&amp;");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await listPublicSeoProducts();
  const categorySlugs = new Set(products.flatMap((product) => product.categoryPath.map((category) => category.slug)));
  const localized = (path: string, params: Record<string, string> = {}) => locales.map((locale) => ({
    url: sitemapXmlUrl(path, locale, params),
    changeFrequency: path.startsWith("/products/") ? "weekly" as const : "daily" as const,
    priority: path === "/" ? 1 : path === "/catalog" ? 0.9 : path.startsWith("/products/") ? 0.8 : 0.7,
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
    ...[...categorySlugs].sort().flatMap((category) => localized("/catalog", { category })),
    ...products.flatMap((product) => localized(`/products/${product.slug}`)),
  ];
}

export const sitemapOrigin = PUBLIC_SITE_ORIGIN;
