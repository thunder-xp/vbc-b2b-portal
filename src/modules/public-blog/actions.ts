"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { requireAdminPermission } from "../admin/services";
import { getAdminBlogService } from "./server";
import { BlogImageError, processBlogHero } from "./blog-image.service";
import type { PublicBlogLocale } from "./types";

export type BlogActionState = { status: "idle" | "success" | "error" | "conflict"; message: string; articleId?: string };
export const blogActionInitial: BlogActionState = { status: "idle", message: "" };
const SOURCE_BUCKET = "public-blog-source";
const PUBLIC_BUCKET = "public-blog-media";

export async function saveAdminBlogArticleAction(_: BlogActionState, form: FormData): Promise<BlogActionState> {
  try {
    await requireAdminPermission("admin.catalog.manage");
    const id = await getAdminBlogService().save(form);
    revalidateBlog(id, String(form.get("slug") ?? ""));
    return { status: "success", message: "Материал сохранён.", articleId: id };
  } catch (error) { return actionFailure(error); }
}

export async function updateAdminBlogHeroAction(_: BlogActionState, form: FormData): Promise<BlogActionState> {
  let uploadedKey: string | null = null;
  try {
    await requireAdminPermission("admin.catalog.manage");
    const articleId = String(form.get("articleId") ?? "");
    const locale = String(form.get("locale")) === "ro" ? "ro" : "ru";
    const revision = Number(form.get("localizationRevision"));
    const remove = form.get("intent") === "remove";
    let processed: Awaited<ReturnType<typeof processBlogHero>> | null = null;
    if (!remove) {
      const file = form.get("hero");
      if (!(file instanceof File)) return { status: "error", message: "Выберите JPG, PNG или WebP до 5 МБ." };
      processed = await processBlogHero(file);
      uploadedKey = `articles/${articleId}/${locale}/${randomUUID()}.webp`;
      const { error } = await createAdminClient().storage.from(SOURCE_BUCKET).upload(uploadedKey, processed.bytes, { contentType: "image/webp", upsert: false });
      if (error) throw error;
    }
    const result = await getAdminBlogService().setHero(articleId, locale, revision, uploadedKey, processed?.width ?? null, processed?.height ?? null);
    if (result.previousSourceStorageKey && result.previousSourceStorageKey !== uploadedKey) await createAdminClient().storage.from(SOURCE_BUCKET).remove([result.previousSourceStorageKey]);
    revalidateBlog(articleId);
    return { status: "success", message: remove ? "Обложка удалена из черновика." : "Обложка оптимизирована и сохранена.", articleId };
  } catch (error) {
    if (uploadedKey) await createAdminClient().storage.from(SOURCE_BUCKET).remove([uploadedKey]);
    if (error instanceof BlogImageError) return { status: "error", message: "Используйте корректное JPG, PNG или WebP до 5 МБ." };
    return actionFailure(error);
  }
}

export async function transitionAdminBlogArticleAction(_: BlogActionState, form: FormData): Promise<BlogActionState> {
  let uploadedPublicKey: string | null = null;
  try {
    await requireAdminPermission("admin.catalog.manage");
    const articleId = String(form.get("articleId") ?? "");
    const locale = (String(form.get("locale")) === "ro" ? "ro" : "ru") as PublicBlogLocale;
    const action = String(form.get("action") ?? "");
    const revision = Number(form.get("localizationRevision"));
    const service = getAdminBlogService();
    const current = await service.get(articleId, locale);
    if (!current) throw new Error("BLOG_NOT_FOUND");
    const sourceKey = current.heroSourceStorageKey ?? "";
    let media: { key: string; url: string } | null = null;
    if (action === "publish" && sourceKey) {
      const admin = createAdminClient();
      const { data, error } = await admin.storage.from(SOURCE_BUCKET).download(sourceKey);
      if (error || !data) throw error ?? new Error("BLOG_MEDIA_SOURCE_MISSING");
      uploadedPublicKey = `articles/${articleId}/${locale}/${randomUUID()}.webp`;
      const { error: uploadError } = await admin.storage.from(PUBLIC_BUCKET).upload(uploadedPublicKey, new Uint8Array(await data.arrayBuffer()), { contentType: "image/webp", upsert: false });
      if (uploadError) throw uploadError;
      media = { key: uploadedPublicKey, url: admin.storage.from(PUBLIC_BUCKET).getPublicUrl(uploadedPublicKey).data.publicUrl };
    }
    const result = await service.transition(articleId, locale, action, revision, media, String(form.get("reason") ?? "").trim() || null);
    if (result.previousPublicStorageKey && result.previousPublicStorageKey !== uploadedPublicKey) await createAdminClient().storage.from(PUBLIC_BUCKET).remove([result.previousPublicStorageKey]);
    revalidateBlog(articleId, current.slug);
    const labels: Record<string, string> = { submit_review: "Материал передан на проверку.", publish: "Материал опубликован.", archive: "Материал архивирован.", restore: "Материал возвращён в черновик." };
    return { status: "success", message: labels[action] ?? "Статус обновлён.", articleId };
  } catch (error) {
    if (uploadedPublicKey) await createAdminClient().storage.from(PUBLIC_BUCKET).remove([uploadedPublicKey]);
    return actionFailure(error);
  }
}

function revalidateBlog(articleId: string, slug = "") {
  revalidatePath("/admin/content/blog"); revalidatePath(`/admin/content/blog/${articleId}`); revalidatePath("/blog"); revalidatePath("/"); revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/blog/${slug}`);
}
function actionFailure(error: unknown): BlogActionState {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("BLOG_VERSION_CONFLICT") || code.includes("BLOG_STATE_CONFLICT")) return { status: "conflict", message: "Материал уже изменён. Обновите страницу и повторите действие." };
  if (code.includes("BLOG_CONTENT_REQUIRED")) return { status: "error", message: "Добавьте структурированный текст материала." };
  console.error({ event: "admin_blog_action_failed", errorType: error instanceof Error ? error.name : typeof error });
  return { status: "error", message: "Не удалось сохранить материал. Проверьте поля и связи." };
}
