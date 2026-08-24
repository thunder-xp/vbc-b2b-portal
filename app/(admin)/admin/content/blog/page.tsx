import Link from "next/link";

import { requireAdminPagePermission } from "@/src/modules/admin";
import { getAdminBlogService } from "@/src/modules/public-blog/server";

export default async function AdminBlogPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  await requireAdminPagePermission("admin.catalog.manage");
  const query = await searchParams;
  const page = Number(query.page) || 1;
  const data = await getAdminBlogService().list(query.status ?? null, query.q ?? "", page);
  return <main className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-emerald-700">Контент</p><h1 className="mt-1 text-2xl font-semibold">Публичный блог</h1><p className="mt-2 text-sm text-zinc-600">Управление публичными RU/RO материалами без доступа к партнёрской Базе знаний.</p></div><Link className="inline-flex min-h-11 items-center bg-emerald-700 px-4 text-sm font-semibold text-white" href="/admin/content/blog/new">Новый материал</Link></header>
    <form className="flex flex-wrap gap-2"><input className="min-h-11 min-w-64 border border-zinc-300 px-3 text-sm" defaultValue={query.q} name="q" placeholder="Заголовок или slug" /><select className="min-h-11 border border-zinc-300 px-3 text-sm" defaultValue={query.status ?? ""} name="status"><option value="">Все статусы</option><option value="draft">Черновики</option><option value="review">На проверке</option><option value="published">Опубликованы</option><option value="archived">Архив</option></select><button className="min-h-11 border border-zinc-300 px-4 text-sm font-semibold">Применить</button></form>
    <div className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Материал</th><th className="px-4 py-3">Язык</th><th className="px-4 py-3">Категория</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3">Обновлён</th></tr></thead><tbody className="divide-y divide-zinc-100">{data.items.map((item) => <tr key={`${item.id}:${item.locale}`}><td className="px-4 py-4"><Link className="font-semibold hover:text-emerald-700" href={`/admin/content/blog/${item.id}?locale=${item.locale}`}>{item.title}</Link><p className="mt-1 text-xs text-zinc-500">/{item.slug}</p></td><td className="px-4 py-4 font-semibold">{item.locale.toUpperCase()}</td><td className="px-4 py-4">{item.categorySlug}</td><td className="px-4 py-4">{item.status}</td><td className="px-4 py-4">{new Date(item.updatedAt).toLocaleDateString("ru-RU")}</td></tr>)}</tbody></table></div>
    {data.total > 30 ? <p className="text-sm text-zinc-500">Показано {data.items.length} из {data.total}. Используйте поиск и фильтр для точного выбора.</p> : null}
  </main>;
}
