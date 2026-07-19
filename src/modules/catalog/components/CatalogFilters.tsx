import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import type { CatalogFacetDto } from "../services";
import { CatalogFilterLink } from "./CatalogFilterLink";

export type CatalogAvailability = "all" | "in_stock" | "expected";
type Props = { availability?: CatalogAvailability; facets?: CatalogFacetDto[]; attributeFilters?: Record<string, string[]>; categoryId?: string; search?: string; sort?: string };
export function CatalogFilters(props: Props) {
  const attributeFilters = props.attributeFilters ?? {};
  const availability = props.availability ?? "all";
  const selectedCount = Object.values(attributeFilters).reduce((sum, values) => sum + values.length, availability === "all" ? 0 : 1);
  const content = <div className="space-y-5">
    <div className="flex items-center justify-between"><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-zinc-500" /><div><h2 className="font-semibold text-zinc-950">Фильтры</h2><p className="mt-1 text-xs text-zinc-500">Выбрано: {selectedCount}</p></div></div>{selectedCount > 0 && <CatalogFilterLink className="text-xs font-medium text-emerald-700" href={catalogHref(persistentParams(props))}>Очистить всё</CatalogFilterLink>}</div>
    <FacetGroup title="Наличие">
      {([
        ["in_stock", "В наличии"],
        ["expected", "К поступлению"],
        ["all", "Все"],
      ] as const).map(([value, label]) => <CatalogFilterLink className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...persistentParams(props), availability: value === "all" ? undefined : value, ...attributeParams(attributeFilters) })} key={value}><span>{label}</span>{availability === value && <Check aria-label="Выбрано" className="size-4 text-emerald-700" />}</CatalogFilterLink>)}
    </FacetGroup>
    {(props.facets ?? []).map((facet) => <FacetGroup key={facet.key} title={facet.label}>{facet.values.map((value) => { const next = toggleValue(attributeFilters, facet.key, value.value); return <CatalogFilterLink className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...baseParams(props), ...attributeParams(next) })} key={value.value}><span aria-hidden className={`size-4 rounded border ${value.selected ? "border-emerald-700 bg-emerald-700" : "border-zinc-300"}`} /><span className="min-w-0 flex-1 truncate">{value.value}</span><span className="text-xs text-zinc-400">{value.count}</span></CatalogFilterLink>; })}</FacetGroup>)}
  </div>;
  return <aside className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">{content}</aside>;
}
function FacetGroup({ children, title }: { children: React.ReactNode; title: string }) { return <details className="group border-t border-zinc-100 pt-4 first:border-t-0 first:pt-0"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-900">{title}<ChevronDown aria-hidden="true" className="size-4 text-zinc-400 transition-transform group-open:rotate-180" /></summary><div className="mt-2 max-h-64 space-y-1 overflow-auto">{children}</div></details>; }
function persistentParams(props: Props) { return { category: props.categoryId, search: props.search, sort: props.sort && props.sort !== "default" ? props.sort : undefined }; }
function baseParams(props: Props) { return { ...persistentParams(props), availability: props.availability && props.availability !== "all" ? props.availability : undefined }; }
function attributeParams(filters: Record<string, string[]>): Record<string, string> { return Object.fromEntries(Object.entries(filters).filter(([, values]) => values.length).map(([key, values]) => [`attr.${key}`, values.join(",")])); }
function toggleValue(filters: Record<string, string[]>, key: string, value: string): Record<string, string[]> { const current = filters[key] ?? []; const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]; return { ...filters, [key]: next }; }
export function catalogHref(values: Record<string, string | undefined>) { const params = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); }); const query = params.toString(); return query ? `/cabinet/catalog?${query}` : "/cabinet/catalog"; }
