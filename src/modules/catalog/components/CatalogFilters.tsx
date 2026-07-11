import { X } from "lucide-react";
import Link from "next/link";
import type { CatalogBrandDto } from "../services";

export function CatalogFilters({ brands, categoryId, search, selectedBrandId, sort }: { brands: CatalogBrandDto[]; categoryId?: string; search?: string; selectedBrandId?: string; sort?: string }) {
  const base = { category: categoryId, search, sort };
  return <aside className="space-y-5 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
    <div><h2 className="font-semibold text-zinc-950">Фильтры</h2><p className="mt-1 text-xs text-zinc-500">Доступные характеристики зависят от выбранной категории.</p></div>
    <fieldset><legend className="text-sm font-semibold">Бренд</legend><div className="mt-2 max-h-56 space-y-1 overflow-auto">{brands.map((brand) => <Link className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${selectedBrandId === brand.id ? "bg-emerald-50 text-emerald-800" : "hover:bg-zinc-50"}`} href={catalogHref({ ...base, brand: selectedBrandId === brand.id ? undefined : brand.id })} key={brand.id}><span>{brand.name}</span>{selectedBrandId === brand.id && <X className="size-3" />}</Link>)}</div></fieldset>
    <div className="border-t border-zinc-100 pt-4"><p className="text-sm font-semibold">Характеристики категории</p><p className="mt-2 text-sm text-zinc-500">Фильтры появятся после синхронизации определений характеристик.</p></div>
  </aside>;
}

export function catalogHref(values: Record<string, string | undefined>) { const params = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); }); const query = params.toString(); return query ? `/cabinet/catalog?${query}` : "/cabinet/catalog"; }
