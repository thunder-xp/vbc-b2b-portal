import { Search } from "lucide-react";

import { listPartnerNomenclatureAction, searchExternalNomenclatureAction } from "@/src/modules/estimates/actions";
import { PartnerNomenclatureWorkspace } from "@/src/modules/estimates/components/PartnerNomenclatureWorkspace";
import { SharedNomenclatureResults } from "@/src/modules/estimates/components/SharedNomenclatureResults";
import type { ExternalNomenclatureItemType } from "@/src/modules/estimates/repositories";
import { externalNomenclatureItemTypeLabel } from "@/src/modules/estimates/services";
import { NumberedPagination } from "@/src/modules/platform-ui";

type SearchParams = { search?: string; type?: string; page?: string; scope?: string };

export default async function NomenclaturePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const itemType = isItemType(query.type) ? query.type : undefined;
  const shared = query.scope === "shared" && itemType && (query.search?.trim().length ?? 0) >= 2
    ? await searchExternalNomenclatureAction({ query: query.search ?? "", itemType, scope: "shared" }) : null;
  const result = shared ? null : await listPartnerNomenclatureAction({ search: query.search, itemType, page: Number.parseInt(query.page ?? "1", 10) || 1 });

  return <div className="min-w-0 space-y-5">
    <header className="border-b border-zinc-200 pb-5"><p className="text-xs font-semibold uppercase text-emerald-700">Сметы и КП</p><h1 className="mt-1 text-2xl font-semibold">Моя номенклатура</h1><p className="mt-1 text-sm text-zinc-500">Оборудование, материалы и работы активной компании для повторного использования в сметах.</p></header>
    <form className="grid min-w-0 gap-3 border-b border-zinc-200 pb-5 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
      <input name="scope" type="hidden" value={query.scope === "shared" ? "shared" : "own"} /><label className="relative min-w-0"><Search aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-zinc-400" /><span className="sr-only">Поиск номенклатуры</span><input className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 pl-9 pr-3 text-sm" defaultValue={query.search} name="search" placeholder="Название, производитель или модель" /></label>
      <label><span className="sr-only">Тип номенклатуры</span><select className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm" defaultValue={itemType ?? ""} name="type"><option value="">Все типы</option>{(["equipment", "material", "service"] as const).map((type) => <option key={type} value={type}>{externalNomenclatureItemTypeLabel(type)}</option>)}</select></label>
      <button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white" type="submit">Найти</button>
    </form>
    <div className="flex justify-end"><a className="min-h-11 text-sm font-semibold text-emerald-700 underline" href={scopeHref(query)}>{query.scope === "shared" ? "Искать только в моей номенклатуре" : "Расширить поиск"}</a></div>
    {shared ? shared.success ? <SharedNomenclatureResults records={shared.data}/> : <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{shared.message}</p> : !result?.success ? <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{result?.message}</p> : <><PartnerNomenclatureWorkspace records={result.data.records} /><NumberedPagination ariaLabel="Страницы номенклатуры" currentPage={result.data.page} hrefForPage={(page) => pageHref(query, page)} totalPages={result.data.totalPages} /></>}
  </div>;
}

function isItemType(value: string | undefined): value is ExternalNomenclatureItemType { return value === "equipment" || value === "material" || value === "service"; }
function pageHref(query: SearchParams, page: number) { const params = new URLSearchParams(); if (query.search) params.set("search", query.search); if (query.type) params.set("type", query.type); params.set("page", String(page)); return `/cabinet/nomenclature?${params.toString()}`; }
function scopeHref(query: SearchParams) { const params=new URLSearchParams();if(query.search)params.set("search",query.search);if(query.type)params.set("type",query.type);params.set("scope",query.scope==="shared"?"own":"shared");return `/cabinet/nomenclature?${params}`; }
