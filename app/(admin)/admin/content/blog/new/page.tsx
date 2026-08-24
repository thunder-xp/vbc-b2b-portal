import { requireAdminPagePermission } from "@/src/modules/admin";
import { AdminBlogEditor } from "@/src/modules/public-blog/AdminBlogEditor";

export default async function NewAdminBlogPage({ searchParams }: { searchParams: Promise<{ locale?: string }> }) { await requireAdminPagePermission("admin.catalog.manage"); const locale = (await searchParams).locale === "ro" ? "ro" : "ru"; return <main className="space-y-6"><header><p className="text-xs font-semibold uppercase text-emerald-700">Публичный блог</p><h1 className="mt-1 text-2xl font-semibold">Новый материал</h1></header><AdminBlogEditor article={null} locale={locale} /></main>; }
