import type { AdminBlogArticle, AdminBlogPage, PublicBlogArticle, PublicBlogCard, PublicBlogLanding, PublicBlogLocale, PublicBlogSitemapEntry } from "./types";

export interface PublicBlogRepository {
  landing(locale: PublicBlogLocale, category: string | null, limit: number, offset: number): Promise<PublicBlogLanding>;
  article(slug: string, locale: PublicBlogLocale): Promise<PublicBlogArticle | null>;
  forProduct(publicProductId: string, locale: PublicBlogLocale, limit: number): Promise<PublicBlogCard[]>;
  forCategory(publicCategoryId: string, locale: PublicBlogLocale, limit: number): Promise<PublicBlogCard[]>;
  sitemap(): Promise<PublicBlogSitemapEntry[]>;
}

export interface AdminBlogRepository {
  list(status: string | null, query: string, limit: number, offset: number): Promise<AdminBlogPage>;
  get(articleId: string, locale: PublicBlogLocale): Promise<AdminBlogArticle | null>;
  save(input: Record<string, unknown>): Promise<string>;
  setHero(input: Record<string, unknown>): Promise<{ previousSourceStorageKey: string | null; revision: number }>;
  transition(input: Record<string, unknown>): Promise<{ status: string; revision: number; previousPublicStorageKey: string | null }>;
}
