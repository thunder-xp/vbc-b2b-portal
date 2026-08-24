import "server-only";

import { cache } from "react";
import { AdminBlogService, PublicBlogService } from "./service";
import { SupabaseAdminBlogRepository, SupabasePublicBlogRepository } from "./supabase.repository";
import type { PublicBlogLocale } from "./types";

const publicService = new PublicBlogService(new SupabasePublicBlogRepository());
const adminService = new AdminBlogService(new SupabaseAdminBlogRepository());

export function getPublicBlogService() { return publicService; }
export function getAdminBlogService() { return adminService; }
export const getPublicBlogArticle = cache((slug: string, locale: PublicBlogLocale) => publicService.article(slug, locale));
export const getPublicBlogLanding = cache((locale: PublicBlogLocale, category: string | null, page: number, limit = 12) => publicService.landing(locale, category, page, limit));
export const getPublicBlogForProduct = cache((id: string, locale: PublicBlogLocale) => publicService.forProduct(id, locale));
export const getPublicBlogForCategory = cache((id: string, locale: PublicBlogLocale) => publicService.forCategory(id, locale));
