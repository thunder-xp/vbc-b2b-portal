import { parsePublicRetailProductSummaries } from "../public-retail/validation";
import type {
  AdminBlogArticle,
  AdminBlogPage,
  PublicBlogArticle,
  PublicBlogBlock,
  PublicBlogCard,
  PublicBlogLanding,
  PublicBlogSitemapEntry,
} from "./types";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Blog projection.");
  return value as Record<string, unknown>;
}
function string(value: unknown): string { if (typeof value !== "string") throw new Error("Invalid Blog projection."); return value; }
function nullableString(value: unknown): string | null { return value == null ? null : string(value); }
function number(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid Blog projection."); return value; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") throw new Error("Invalid Blog projection."); return value; }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error("Invalid Blog projection."); return value; }

export function parseBlogBlocks(value: unknown): PublicBlogBlock[] {
  return array(value).map((candidate) => {
    const block = record(candidate);
    const type = string(block.type);
    if (type === "heading2" || type === "heading3" || type === "paragraph") return { type, text: string(block.text) };
    if (type === "ordered_list" || type === "unordered_list") return { type, items: array(block.items).map(string) };
    throw new Error("Invalid Blog content block.");
  });
}

function card(value: unknown): PublicBlogCard {
  const item = record(value);
  return {
    id: string(item.id), slug: string(item.slug), categorySlug: string(item.categorySlug),
    featured: boolean(item.featured), title: string(item.title), excerpt: string(item.excerpt),
    heroUrl: nullableString(item.heroUrl), heroAlt: nullableString(item.heroAlt),
    publishedAt: string(item.publishedAt), updatedAt: string(item.updatedAt),
  };
}

export function parsePublicBlogLanding(value: unknown): PublicBlogLanding {
  const data = record(value);
  return {
    items: array(data.items).map(card), total: number(data.total),
    categories: array(data.categories).map((candidate) => { const item = record(candidate); return { slug: string(item.slug), count: number(item.count) }; }),
  };
}

export function parsePublicBlogArticle(value: unknown): PublicBlogArticle {
  const data = record(value);
  return {
    ...card(data), content: parseBlogBlocks(data.content), metaTitle: nullableString(data.metaTitle),
    metaDescription: nullableString(data.metaDescription), heroWidth: data.heroWidth == null ? null : number(data.heroWidth),
    heroHeight: data.heroHeight == null ? null : number(data.heroHeight),
    products: parsePublicRetailProductSummaries(data.products),
    categories: array(data.categories).map((candidate) => { const item = record(candidate); return { id: string(item.id), slug: string(item.slug), name: string(item.name) }; }),
    services: array(data.services).map((candidate) => { const item = record(candidate); return { key: string(item.key) as "cctv_calculator" | "installation" | "catalog", href: string(item.href) }; }),
    related: array(data.related).map(card),
  };
}

export function parsePublicBlogCards(value: unknown): PublicBlogCard[] { return array(value).map(card); }

export function parseAdminBlogPage(value: unknown): AdminBlogPage {
  const data = record(value);
  return { total: number(data.total), items: array(data.items).map((candidate) => {
    const item = record(candidate);
    return { id: string(item.id), slug: string(item.slug), categorySlug: string(item.categorySlug), featured: boolean(item.featured), articleRevision: number(item.articleRevision), locale: string(item.locale) as "ru" | "ro", status: string(item.status) as AdminBlogPage["items"][number]["status"], title: string(item.title), excerpt: string(item.excerpt), localizationRevision: number(item.localizationRevision), updatedAt: string(item.updatedAt) };
  }) };
}

export function parseAdminBlogArticle(value: unknown): AdminBlogArticle {
  const data = record(value);
  return {
    id: string(data.id), slug: string(data.slug), categorySlug: string(data.categorySlug), featured: boolean(data.featured),
    articleRevision: number(data.articleRevision), locale: string(data.locale) as "ru" | "ro", status: string(data.status) as AdminBlogArticle["status"],
    title: string(data.title), excerpt: string(data.excerpt), content: parseBlogBlocks(data.content),
    metaTitle: nullableString(data.metaTitle), metaDescription: nullableString(data.metaDescription), heroAlt: nullableString(data.heroAlt),
    heroSourceStorageKey: nullableString(data.heroSourceStorageKey), heroPublicStorageKey: nullableString(data.heroPublicStorageKey), heroPublicUrl: nullableString(data.heroPublicUrl),
    heroWidth: data.heroWidth == null ? null : number(data.heroWidth), heroHeight: data.heroHeight == null ? null : number(data.heroHeight),
    localizationRevision: number(data.localizationRevision), publishedAt: nullableString(data.publishedAt),
    productSkus: array(data.productSkus).map(string), categorySlugs: array(data.categorySlugs).map(string), serviceKeys: array(data.serviceKeys).map(string), relatedSlugs: array(data.relatedSlugs).map(string),
  };
}

export function parseBlogSitemap(value: unknown): PublicBlogSitemapEntry[] {
  return array(value).map((candidate) => { const item = record(candidate); return { slug: string(item.slug), locale: string(item.locale) as "ru" | "ro", lastModified: string(item.lastModified) }; });
}
