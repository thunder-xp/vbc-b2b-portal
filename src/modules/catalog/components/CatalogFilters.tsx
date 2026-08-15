import { Check } from "lucide-react";
import type { CatalogFacetDto } from "../services";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import { CatalogFilterLink } from "./CatalogFilterLink";
import { CatalogFilterShell } from "./CatalogFilterShell";
import { CatalogFilterGroup, CatalogFilterPanel } from "./CatalogFilterPanel";

export type CatalogAvailability = "all" | "in_stock" | "expected";
type Props = { availability?: CatalogAvailability; facets?: CatalogFacetDto[]; attributeFilters?: Record<string, string[]>; brandId?: string; categoryId?: string; explicitAll?: boolean; merchandisingLabel?: MerchandisingLabelCode; search?: string; sort?: string };
export function CatalogFilters(props: Props) {
  const attributeFilters = props.attributeFilters ?? {};
  const availability = props.availability ?? "all";
  const selectedCount = Object.values(attributeFilters).reduce((sum, values) => sum + values.length, availability === "all" ? 0 : 1);
  const content = <CatalogFilterPanel clearAction={<CatalogFilterLink className="text-xs font-medium text-emerald-700" href={catalogHref(persistentParams(props))}>Очистить всё</CatalogFilterLink>} selectedCount={selectedCount} title="Фильтры">
    <CatalogFilterGroup title="Наличие">
      {([
        ["in_stock", "В наличии"],
        ["expected", "К поступлению"],
        ["all", "Все"],
      ] as const).map(([value, label]) => <CatalogFilterLink className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...persistentParams(props), availability: value === "all" ? undefined : value, ...attributeParams(attributeFilters) })} key={value}><span>{label}</span>{availability === value && <Check aria-label="Выбрано" className="size-4 text-emerald-700" />}</CatalogFilterLink>)}
    </CatalogFilterGroup>
    <CatalogFilterGroup title="Подборки">
      {([
        ["TOP", "Популярные"],
        ["NEW", "Новинки"],
        ["HOT", "Горячие предложения"],
      ] as const).map(([value, label]) => <CatalogFilterLink className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...baseParams(props), label: props.merchandisingLabel === value ? undefined : value, ...attributeParams(attributeFilters) })} key={value}><span>{label}</span>{props.merchandisingLabel === value && <Check aria-label="Выбрано" className="size-4 text-emerald-700" />}</CatalogFilterLink>)}
    </CatalogFilterGroup>
    {(props.facets ?? []).map((facet) => <CatalogFilterGroup key={facet.key} title={facet.label}>{facet.values.map((value) => { const next = toggleValue(attributeFilters, facet.key, value.value); return <CatalogFilterLink className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...baseParams(props), ...attributeParams(next) })} key={value.value}><span aria-hidden className={`size-4 rounded border ${value.selected ? "border-emerald-700 bg-emerald-700" : "border-zinc-300"}`} /><span className="min-w-0 flex-1 truncate">{value.value}</span><span className="text-xs text-zinc-400">{value.count}</span></CatalogFilterLink>; })}</CatalogFilterGroup>)}
  </CatalogFilterPanel>;
  return <CatalogFilterShell selectedCount={selectedCount}>{content}</CatalogFilterShell>;
}
function persistentParams(props: Props) { return { brand: props.brandId, category: props.categoryId, label: props.merchandisingLabel, search: props.search, sort: props.sort && props.sort !== "default" ? props.sort : undefined, view: props.explicitAll ? "all" : undefined }; }
function baseParams(props: Props) { return { ...persistentParams(props), availability: props.availability && props.availability !== "all" ? props.availability : undefined }; }
function attributeParams(filters: Record<string, string[]>): Record<string, string> { return Object.fromEntries(Object.entries(filters).filter(([, values]) => values.length).map(([key, values]) => [`attr.${key}`, values.join(",")])); }
function toggleValue(filters: Record<string, string[]>, key: string, value: string): Record<string, string[]> { const current = filters[key] ?? []; const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]; return { ...filters, [key]: next }; }
export function catalogHref(values: Record<string, string | undefined>) { const params = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); }); const query = params.toString(); return query ? `/cabinet/catalog?${query}` : "/cabinet/catalog"; }
