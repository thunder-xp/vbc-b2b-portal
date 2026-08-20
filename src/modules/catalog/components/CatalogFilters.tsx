import { Check } from "lucide-react";
import type { CatalogFacetDto } from "../services";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import { CatalogFilterLink } from "./CatalogFilterLink";
import { CatalogFilterShell } from "./CatalogFilterShell";
import { CatalogFilterGroup, CatalogFilterPanel } from "./CatalogFilterPanel";
import { catalogFacetQueryFields } from "../services/catalog-facet-state";
import { CatalogTechnicalFacetGroups } from "./CatalogTechnicalFacetGroups";
import type { CatalogCollection } from "../types";

export type CatalogAvailability = "all" | "in_stock" | "expected";
type Props = { availability?: CatalogAvailability; facets?: CatalogFacetDto[]; attributeFilters?: Record<string, string[]>; brandId?: string; categoryId?: string; collection?: CatalogCollection; explicitAll?: boolean; merchandisingLabel?: MerchandisingLabelCode; search?: string; sort?: string };
export function CatalogFilters(props: Props) {
  const attributeFilters = props.attributeFilters ?? {};
  const availability = props.availability ?? "all";
  const selectedCount = Object.values(attributeFilters).reduce((sum, values) => sum + values.length, (availability === "all" ? 0 : 1) + (props.collection || props.merchandisingLabel ? 1 : 0));
  const content = <CatalogFilterPanel clearAction={<CatalogFilterLink className="text-xs font-medium text-emerald-700" href={catalogHref(clearParams(props))}>Очистить всё</CatalogFilterLink>} selectedCount={selectedCount} title="Фильтры">
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
      ] as const).map(([value, label]) => <CatalogFilterLink className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...selectionBaseParams(props), label: props.merchandisingLabel === value ? undefined : value, ...attributeParams(attributeFilters) })} key={value}><span>{label}</span>{props.merchandisingLabel === value && <Check aria-label="Выбрано" className="size-4 text-emerald-700" />}</CatalogFilterLink>)}
      <CatalogFilterLink className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...selectionBaseParams(props), collection: props.collection ? undefined : "replenishment", ...attributeParams(attributeFilters) })}><span>Пополнение</span>{props.collection === "replenishment" && <Check aria-label="Выбрано" className="size-4 text-emerald-700" />}</CatalogFilterLink>
    </CatalogFilterGroup>
    <CatalogTechnicalFacetGroups facets={props.facets ?? []} hrefForSelection={(selection) => catalogHref({ ...baseParams(props), ...catalogFacetQueryFields(selection) })} selection={attributeFilters} />
  </CatalogFilterPanel>;
  return <CatalogFilterShell selectedCount={selectedCount}>{content}</CatalogFilterShell>;
}
function persistentParams(props: Props) { return { brand: props.brandId, category: props.categoryId, collection: props.collection, label: props.merchandisingLabel, search: props.search, sort: props.sort && props.sort !== "default" ? props.sort : undefined, view: props.explicitAll ? "all" : undefined }; }
function baseParams(props: Props) { return { ...persistentParams(props), availability: props.availability && props.availability !== "all" ? props.availability : undefined }; }
function selectionBaseParams(props: Props) { return { brand: props.brandId, category: props.categoryId, search: props.search, sort: props.sort && props.sort !== "default" ? props.sort : undefined, view: props.explicitAll ? "all" : undefined, availability: props.availability && props.availability !== "all" ? props.availability : undefined }; }
function clearParams(props: Props) { return { brand: props.brandId, category: props.categoryId, search: props.search, sort: props.sort && props.sort !== "default" ? props.sort : undefined, view: props.explicitAll ? "all" : undefined }; }
const attributeParams = catalogFacetQueryFields;
export function catalogHref(values: Record<string, string | undefined>) { const params = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); }); const query = params.toString(); return query ? `/cabinet/catalog?${query}` : "/cabinet/catalog"; }
