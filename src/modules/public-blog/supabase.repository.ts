import "server-only";

import { createPublicReadClient } from "@/src/lib/supabase/public";
import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "../access-control/repositories";
import type { AdminBlogRepository, PublicBlogRepository } from "./repository";
import type { PublicBlogLocale } from "./types";
import { parseAdminBlogArticle, parseAdminBlogPage, parseBlogSitemap, parsePublicBlogArticle, parsePublicBlogCards, parsePublicBlogLanding } from "./validation";

async function publicRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await createPublicReadClient({ cache: "force-cache" }).rpc(name, args);
  if (error) throw new RepositoryUnexpectedError();
  return data;
}
async function adminRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (await createClient()).rpc(name, args);
  if (error?.code === "PT409") throw new Error(error.message.includes("STATE") ? "BLOG_STATE_CONFLICT" : "BLOG_VERSION_CONFLICT");
  if (error) throw new RepositoryUnexpectedError();
  return data as T;
}

export class SupabasePublicBlogRepository implements PublicBlogRepository {
  async landing(locale: PublicBlogLocale, category: string | null, limit: number, offset: number) { return parsePublicBlogLanding(await publicRpc("list_public_blog_articles", { p_locale: locale, p_category: category, p_limit: limit, p_offset: offset })); }
  async article(slug: string, locale: PublicBlogLocale) { const data = await publicRpc("get_public_blog_article", { p_slug: slug, p_locale: locale }); return data == null ? null : parsePublicBlogArticle(data); }
  async forProduct(publicProductId: string, locale: PublicBlogLocale, limit: number) { return parsePublicBlogCards(await publicRpc("list_public_blog_for_product", { p_product_public_id: publicProductId, p_locale: locale, p_limit: limit })); }
  async forCategory(publicCategoryId: string, locale: PublicBlogLocale, limit: number) { return parsePublicBlogCards(await publicRpc("list_public_blog_for_category", { p_category_public_id: publicCategoryId, p_locale: locale, p_limit: limit })); }
  async sitemap() { return parseBlogSitemap(await publicRpc("list_public_blog_sitemap_inventory", {})); }
}

export class SupabaseAdminBlogRepository implements AdminBlogRepository {
  async list(status: string | null, query: string, limit: number, offset: number) { return parseAdminBlogPage(await adminRpc("list_admin_blog_articles", { p_status: status, p_query: query, p_limit: limit, p_offset: offset })); }
  async get(articleId: string, locale: PublicBlogLocale) { const data = await adminRpc<unknown>("get_admin_blog_article", { p_article_id: articleId, p_locale: locale }); return data == null ? null : parseAdminBlogArticle(data); }
  save(input: Record<string, unknown>) { return adminRpc<string>("save_admin_blog_article", input); }
  setHero(input: Record<string, unknown>) { return adminRpc<{ previousSourceStorageKey: string | null; revision: number }>("set_admin_blog_hero", input); }
  transition(input: Record<string, unknown>) { return adminRpc<{ status: string; revision: number; previousPublicStorageKey: string | null }>("transition_admin_blog_article", input); }
}
