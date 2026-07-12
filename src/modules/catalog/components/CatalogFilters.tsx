import { SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import type { CatalogBrandDto, CatalogFacetDto } from "../services";

type Props = { brands: CatalogBrandDto[]; facets?: CatalogFacetDto[]; attributeFilters?: Record<string, string[]>; categoryId?: string; search?: string; selectedBrandId?: string; sort?: string };
export function CatalogFilters(props: Props) {
  const attributeFilters = props.attributeFilters ?? {};
  const selectedCount = Object.values(attributeFilters).reduce((sum, values) => sum + values.length, 0);
  const content = <div className="space-y-5">
    <div className="flex items-center justify-between"><div><h2 className="font-semibold text-zinc-950">Фильтры</h2><p className="mt-1 text-xs text-zinc-500">Выбрано: {selectedCount}</p></div>{selectedCount > 0 && <Link className="text-xs font-medium text-emerald-700" href={catalogHref(baseParams(props))}>Очистить всё</Link>}</div>
    <FacetGroup title="Бренд">{props.brands.map((brand) => <Link className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...baseParams(props), brand: props.selectedBrandId === brand.id ? undefined : brand.id, ...attributeParams(attributeFilters) })} key={brand.id}><span>{brand.name}</span>{props.selectedBrandId === brand.id && <X className="size-3" />}</Link>)}</FacetGroup>
    {(props.facets ?? []).map((facet) => <FacetGroup key={facet.key} title={facet.label}>{facet.values.map((value) => { const next = toggleValue(attributeFilters, facet.key, value.value); return <Link className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...baseParams(props), brand: props.selectedBrandId, ...attributeParams(next) })} key={value.value}><span aria-hidden className={`size-4 rounded border ${value.selected ? "border-emerald-700 bg-emerald-700" : "border-zinc-300"}`} /><span className="min-w-0 flex-1 truncate">{value.value}</span><span className="text-xs text-zinc-400">{value.count}</span></Link>; })}</FacetGroup>)}
  </div>;
  return <details className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm" open><summary className="flex cursor-pointer list-none items-center gap-2 font-semibold lg:hidden"><SlidersHorizontal className="size-4" />Фильтры {selectedCount > 0 && `(${selectedCount})`}</summary><div className="mt-4 lg:mt-0">{content}</div></details>;
}
function FacetGroup({ children, title }: { children: React.ReactNode; title: string }) { return <details open><summary className="cursor-pointer text-sm font-semibold text-zinc-900">{title}</summary><div className="mt-2 max-h-64 space-y-1 overflow-auto">{children}</div></details>; }
function baseParams(props: Props) { return { category: props.categoryId, search: props.search, sort: props.sort && props.sort !== "default" ? props.sort : undefined }; }
function attributeParams(filters: Record<string, string[]>): Record<string, string> { return Object.fromEntries(Object.entries(filters).filter(([, values]) => values.length).map(([key, values]) => [`attr.${key}`, values.join(",")])); }
function toggleValue(filters: Record<string, string[]>, key: string, value: string): Record<string, string[]> { const current = filters[key] ?? []; const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]; return { ...filters, [key]: next }; }
export function catalogHref(values: Record<string, string | undefined>) { const params = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); }); const query = params.toString(); return query ? `/cabinet/catalog?${query}` : "/cabinet/catalog"; }
