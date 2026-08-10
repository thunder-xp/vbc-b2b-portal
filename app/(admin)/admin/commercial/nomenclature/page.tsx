import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdminPagePermission } from "@/src/modules/admin/services/admin-page-guard";
import { listAdminNomenclatureAction } from "@/src/modules/estimates/actions";
import type { ExternalNomenclatureItemType, NomenclatureCurationStatus } from "@/src/modules/estimates/repositories";
import { NomenclatureCover } from "@/src/modules/estimates/components/NomenclatureCover";
import { NumberedPagination } from "@/src/modules/platform-ui";

type Params = { q?: string; type?: string; status?: string; category?: string; manufacturer?: string; page?: string };
export default async function AdminNomenclaturePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdminPagePermission("admin.external_nomenclature.view"); const query = await searchParams;
  const result = await listAdminNomenclatureAction({ search: query.q, itemType: itemType(query.type), status: status(query.status), category: query.category, manufacturer: query.manufacturer, page: Number(query.page) || 1 });
  return <div className="min-w-0 space-y-5"><header><p className="text-xs font-semibold uppercase text-emerald-700">Коммерческие данные</p><h1 className="mt-1 text-2xl font-semibold">Номенклатура партнёров</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">Управление каноническими внешними позициями портала. Эти данные не являются каталогом 1С.</p></header>
    <form className="grid gap-2 border-y border-zinc-200 py-4 md:grid-cols-[minmax(12rem,1fr)_11rem_12rem_minmax(9rem,1fr)_minmax(9rem,1fr)_auto]">
      <label className="relative"><Search className="absolute left-3 top-3.5 size-4 text-zinc-400" /><span className="sr-only">Поиск</span><input className="h-11 w-full border border-zinc-300 pl-9 pr-3 text-sm" defaultValue={query.q} name="q" placeholder="Название, бренд, модель" /></label>
      <select aria-label="Тип" className="h-11 border border-zinc-300 bg-white px-3 text-sm" defaultValue={query.type ?? ""} name="type"><option value="">Все типы</option><option value="equipment">Оборудование</option><option value="material">Материал</option><option value="service">Работа / услуга</option></select>
      <select aria-label="Статус" className="h-11 border border-zinc-300 bg-white px-3 text-sm" defaultValue={query.status ?? ""} name="status"><option value="">Все статусы</option><option value="review_required">Требует проверки</option><option value="active">Каноническая</option><option value="duplicate">Дубликат</option><option value="archived">Архив</option></select>
      <input aria-label="Категория" className="h-11 border border-zinc-300 px-3 text-sm" defaultValue={query.category} name="category" placeholder="Категория" />
      <input aria-label="Производитель" className="h-11 border border-zinc-300 px-3 text-sm" defaultValue={query.manufacturer} name="manufacturer" placeholder="Производитель" />
      <button className="h-11 bg-zinc-900 px-4 text-sm font-semibold text-white">Применить</button>
    </form>
    <div className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-3">Обложка</th><th className="p-3">Наименование</th><th className="p-3">Тип</th><th className="p-3">Производитель / модель</th><th className="p-3">Категория</th><th className="p-3">Ед.</th><th className="p-3">Статус</th><th className="p-3">Компаний</th><th className="p-3">Смет / запросов</th><th className="p-3">Последнее использование</th></tr></thead><tbody>{result.records.map((item) => <tr className="border-t border-zinc-200" key={item.id}><td className="p-3"><NomenclatureCover hasCover={item.hasCover} itemId={item.id} name={item.name} size="sm" /></td><td className="p-3"><Link className="font-semibold text-emerald-700" href={`/admin/commercial/nomenclature/${item.id}`}>{item.name}</Link></td><td className="p-3">{typeLabel(item.itemType)}</td><td className="p-3">{[item.manufacturer,item.model].filter(Boolean).join(" · ") || "—"}</td><td className="p-3">{item.category ?? "—"}</td><td className="p-3">{item.unit}</td><td className="p-3">{statusLabel(item.curationStatus)}</td><td className="p-3">{item.companyCount}</td><td className="p-3">{item.estimateCount} / {item.requestCount}</td><td className="p-3">{date(item.lastObserved)}</td></tr>)}</tbody></table>{!result.records.length ? <p className="p-8 text-center text-sm text-zinc-500">Позиции не найдены.</p> : null}</div>
    <NumberedPagination ariaLabel="Страницы номенклатуры" currentPage={result.page} hrefForPage={(page) => href(query,page)} totalPages={result.totalPages} />
  </div>;
}
function itemType(value?: string): ExternalNomenclatureItemType | undefined { return value === "equipment" || value === "material" || value === "service" ? value : undefined; }
function status(value?: string): NomenclatureCurationStatus | undefined { return value === "active" || value === "review_required" || value === "duplicate" || value === "archived" ? value : undefined; }
function typeLabel(value: ExternalNomenclatureItemType) { return value === "equipment" ? "Оборудование" : value === "material" ? "Материал" : "Работа / услуга"; }
function statusLabel(value: NomenclatureCurationStatus) { return value === "active" ? "Каноническая" : value === "review_required" ? "Требует проверки" : value === "duplicate" ? "Дубликат" : "Архив"; }
function date(value: string) { return new Intl.DateTimeFormat("ru-RU",{dateStyle:"short"}).format(new Date(value)); }
function href(query: Params,page:number) { const p=new URLSearchParams(); for(const [key,value] of Object.entries(query)) if(value&&key!=="page")p.set(key,value);p.set("page",String(page));return `?${p}`; }
