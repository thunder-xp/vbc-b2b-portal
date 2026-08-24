import { notFound } from "next/navigation";
import { requireAdminPagePermission } from "@/src/modules/admin";
import { AdminBlogEditor } from "@/src/modules/public-blog/AdminBlogEditor";
import { getAdminBlogService } from "@/src/modules/public-blog/server";

export default async function EditAdminBlogPage({ params, searchParams }: { params: Promise<{ articleId: string }>; searchParams: Promise<{ locale?: string }> }) { await requireAdminPagePermission("admin.catalog.manage"); const [{ articleId }, query] = await Promise.all([params, searchParams]); const locale = query.locale === "ro" ? "ro" : "ru"; const article = await getAdminBlogService().get(articleId, locale); if (!article) notFound(); return <main className="space-y-6"><header><p className="text-xs font-semibold uppercase text-emerald-700">Публичный блог / {locale.toUpperCase()}</p><h1 className="mt-1 text-2xl font-semibold">{article.title || article.slug}</h1><p className="mt-2 text-sm text-zinc-600">Изменение опубликованной версии возвращает эту локализацию в черновик.</p></header><AdminBlogEditor article={article} locale={locale} /></main>; }
