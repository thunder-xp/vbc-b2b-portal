import Link from "next/link";

import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { LocalizationWorkbench } from "@/src/modules/localization/LocalizationWorkbench";
import { createLocalizationService } from "@/src/modules/localization/service-factory";

export default async function AdminLocalizationPage({ searchParams }: {
  searchParams: Promise<{ entity?: string; status?: string; q?: string; page?: string }>;
}) {
  const context = await requireAdminPagePermission("admin.catalog.view");
  const params = await searchParams;
  const entityType = params.entity === "product" ? "product" : "category";
  const page = await createLocalizationService().listWorkbench({
    entityType, status: params.status, search: params.q, page: Number(params.page) || 1,
  });
  const canManage = context.permissions.includes("admin.catalog.manage");
  const cards = [
    ["Категории без перевода", page.summary.missingCategories], ["Товары без перевода", page.summary.missingProducts],
    ["Машинные черновики", page.summary.machineDraftCategories + page.summary.machineDraftProducts],
    ["Проверено", page.summary.reviewedCategories + page.summary.reviewedProducts],
    ["Устарело", page.summary.outdatedCategories + page.summary.outdatedProducts],
    ["В очереди", page.summary.queuedJobs], ["Ошибки", page.summary.failedJobs],
  ] as const;
  return <main className="space-y-6">
    <header><p className="text-xs font-semibold uppercase text-blue-700">Контент</p><h1 className="mt-1 text-2xl font-semibold">Локализация каталога</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">Румынское представление поверх синхронизированных данных 1С. Коммерческие данные здесь не изменяются.</p></header>
    <div className="grid gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value])=><section className="bg-white p-4" key={label}><p className="text-xs font-semibold text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></section>)}</div>
    <form className="flex flex-wrap gap-2"><select className="min-h-11 border border-zinc-300 px-3 text-sm" defaultValue={entityType} name="entity"><option value="category">Категории</option><option value="product">Товары</option></select><select className="min-h-11 border border-zinc-300 px-3 text-sm" defaultValue={params.status ?? ""} name="status"><option value="">Все статусы</option><option value="missing">Нет перевода</option><option value="machine_draft">Машинный черновик</option><option value="outdated">Устарело</option><option value="reviewed">Проверено</option></select><input className="min-h-11 min-w-64 flex-1 border border-zinc-300 px-3 text-sm" defaultValue={params.q} name="q" placeholder={entityType === "product" ? "SKU или название" : "Название категории"} /><button className="min-h-11 bg-zinc-950 px-4 text-sm font-semibold text-white">Применить</button></form>
    <LocalizationWorkbench canManage={canManage} entityType={entityType} items={page.items} />
    <nav className="flex items-center justify-between text-sm"><span>{page.totalCount} записей</span><div className="flex gap-4">{page.page > 1 ? <Link href={href(page.page-1,params)}>Назад</Link> : null}{page.page*page.pageSize < page.totalCount ? <Link href={href(page.page+1,params)}>Далее</Link> : null}</div></nav>
  </main>;
}

function href(page: number, params: { entity?: string; status?: string; q?: string }) { const query = new URLSearchParams({ page: String(page) }); if(params.entity)query.set("entity",params.entity);if(params.status)query.set("status",params.status);if(params.q)query.set("q",params.q);return `/admin/content/localization?${query}`; }
