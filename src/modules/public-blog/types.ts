import type { PublicRetailProductSummaryDto } from "../public-retail/types";

export type PublicBlogLocale = "ru" | "ro";
export type PublicBlogStatus = "draft" | "review" | "published" | "archived";

export type PublicBlogBlock =
  | { type: "heading2"; text: string }
  | { type: "heading3"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ordered_list"; items: string[] }
  | { type: "unordered_list"; items: string[] };

export type PublicBlogCard = {
  id: string;
  slug: string;
  categorySlug: string;
  featured: boolean;
  title: string;
  excerpt: string;
  heroUrl: string | null;
  heroAlt: string | null;
  publishedAt: string;
  updatedAt: string;
};

export type PublicBlogLanding = {
  items: PublicBlogCard[];
  total: number;
  categories: Array<{ slug: string; count: number }>;
};

export type PublicBlogArticle = PublicBlogCard & {
  content: PublicBlogBlock[];
  metaTitle: string | null;
  metaDescription: string | null;
  heroWidth: number | null;
  heroHeight: number | null;
  products: PublicRetailProductSummaryDto[];
  categories: Array<{ id: string; slug: string; name: string }>;
  services: Array<{ key: "cctv_calculator" | "installation" | "catalog"; href: string }>;
  related: PublicBlogCard[];
};

export type AdminBlogListItem = {
  id: string;
  slug: string;
  categorySlug: string;
  featured: boolean;
  articleRevision: number;
  locale: PublicBlogLocale;
  status: PublicBlogStatus;
  title: string;
  excerpt: string;
  localizationRevision: number;
  updatedAt: string;
};

export type AdminBlogPage = { items: AdminBlogListItem[]; total: number };

export type AdminBlogArticle = {
  id: string;
  slug: string;
  categorySlug: string;
  featured: boolean;
  articleRevision: number;
  locale: PublicBlogLocale;
  status: PublicBlogStatus;
  title: string;
  excerpt: string;
  content: PublicBlogBlock[];
  metaTitle: string | null;
  metaDescription: string | null;
  heroAlt: string | null;
  heroSourceStorageKey: string | null;
  heroPublicStorageKey: string | null;
  heroPublicUrl: string | null;
  heroWidth: number | null;
  heroHeight: number | null;
  localizationRevision: number;
  publishedAt: string | null;
  productSkus: string[];
  categorySlugs: string[];
  serviceKeys: string[];
  relatedSlugs: string[];
};

export type PublicBlogSitemapEntry = {
  slug: string;
  locale: PublicBlogLocale;
  lastModified: string;
};
