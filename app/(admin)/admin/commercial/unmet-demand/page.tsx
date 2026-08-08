import Link from "next/link";

import { listExternalDemandForAdmin } from "@/src/modules/estimates/actions/demand.actions";
import { requireAdminPagePermission } from "@/src/modules/admin/services/admin-page-guard";

export default async function ExternalDemandPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireAdminPagePermission("admin.external_demand.view");
  const params = await searchParams;
  const page = Math.max(Number(params.page ?? 1) || 1, 1);
  const result = await listExternalDemandForAdmin({ search: params.q, status: params.status, page });
  return <div className="space-y-5">
    <header><p className="text-xs font-semibold uppercase text-emerald-700">Коммерческие данные</p><h1 className="mt-1 text-2xl font-semibold text-zinc-950">Неудовлетворённый ассортиментный спрос</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">Внешние позиции из активных смет и явные запросы партнёров. Архивные сметы исключены.</p></header>
    <form className="grid gap-2 border-y border-zinc-200 bg-white py-4 sm:grid-cols-[minmax(12rem,1fr)_14rem_auto]">
      <input className="h-11 border border-zinc-300 px-3 text-sm" defaultValue={params.q} name="q" placeholder="Производитель, модель или название" />
      <select className="h-11 border border-zinc-300 bg-white px-3 text-sm" defaultValue={params.status ?? ""} name="status"><option value="">Все состояния</option><option value="new">Новые</option><option value="reviewing">На рассмотрении</option><option value="solution_proposed">Решение предложено</option><option value="closed">Закрытые</option></select>
      <button className="min-h-11 bg-zinc-900 px-4 text-sm font-semibold text-white">Применить</button>
    </form>
    <div className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-zinc-50 text-zinc-600"><tr><th className="p-3">Внешняя позиция</th><th className="p-3">Категория</th><th className="p-3">Сметы</th><th className="p-3">Партнёры</th><th className="p-3">Заказчики</th><th className="p-3">Количество</th><th className="p-3">Запросы</th><th className="p-3">Последнее</th></tr></thead><tbody>{result.items.map((item) => <tr className="border-t border-zinc-200" key={item.externalItemId}><td className="p-3"><Link className="font-semibold text-emerald-700" href={`/admin/commercial/unmet-demand/${item.externalItemId}`}>{item.manufacturer} {item.model}</Link><p className="text-xs text-zinc-500">{item.name}</p></td><td className="p-3">{item.category ?? "—"}</td><td className="p-3">{item.estimateCount}</td><td className="p-3">{item.partnerCount}</td><td className="p-3">{item.customerCount}</td><td className="p-3">{item.requestedQuantity} {item.unit}</td><td className="p-3">{item.explicitRequestCount}</td><td className="p-3">{date(item.lastObserved)}</td></tr>)}</tbody></table>{!result.items.length && <p className="p-8 text-center text-sm text-zinc-500">Данные не найдены.</p>}</div>
    <nav className="flex justify-between text-sm"><PageLink disabled={page <= 1} href={href(params, page - 1)}>Назад</PageLink><span>Страница {page}</span><PageLink disabled={page * 25 >= result.total} href={href(params, page + 1)}>Далее</PageLink></nav>
  </div>;
}
function href(params: { q?: string; status?: string }, page: number) { const query = new URLSearchParams(); if (params.q) query.set("q", params.q); if (params.status) query.set("status", params.status); query.set("page", String(page)); return `?${query}`; }
function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) { return disabled ? <span className="text-zinc-400">{children}</span> : <Link className="font-semibold text-emerald-700" href={href}>{children}</Link>; }
function date(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(new Date(value)); }
