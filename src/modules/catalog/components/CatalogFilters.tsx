import { Check } from "lucide-react";
import type { CatalogFacetDto } from "../services";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import { CatalogFilterLink } from "./CatalogFilterLink";
import { CatalogFilterShell } from "./CatalogFilterShell";
import { CatalogFilterGroup, CatalogFilterPanel } from "./CatalogFilterPanel";
import { catalogFacetQueryFields } from "../services/catalog-facet-state";
import { CatalogTechnicalFacetGroups } from "./CatalogTechnicalFacetGroups";
import type { CatalogCollection } from "../types";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";
import type { CatalogQuickLinkCode } from "../services";
import type { NewRollingPeriod } from "../../commerce-period";

export type CatalogAvailability = "all" | "in_stock" | "expected";
type Props = { availability?: CatalogAvailability; facets?: CatalogFacetDto[]; attributeFilters?: Record<string, string[]>; brandId?: string; categoryId?: string; categoryIds?: string[]; categorySet?: CatalogQuickLinkCode; collection?: CatalogCollection; explicitAll?: boolean; locale?: PartnerLocale; merchandisingLabel?: MerchandisingLabelCode; period?: NewRollingPeriod; search?: string; sort?: string };
export function CatalogFilters(props: Props) {
  const copy = getCatalogCopy(props.locale ?? "ru");
  const attributeFilters = props.attributeFilters ?? {};
  const availability = props.availability ?? "all";
  const selectedCount = Object.values(attributeFilters).reduce((sum, values) => sum + values.length, (availability === "all" ? 0 : 1) + (props.collection || props.merchandisingLabel ? 1 : 0));
  const content = <CatalogFilterPanel clearAction={<CatalogFilterLink className="text-xs font-medium text-emerald-700" href={catalogHref(clearParams(props))}>{copy.clearAll}</CatalogFilterLink>} selectedCount={selectedCount} selectedLabel={copy.selected} title={copy.filters}>
    <CatalogFilterGroup title={copy.availability}>
      {([
        ["in_stock", copy.inStock],
        ["expected", copy.expected],
        ["all", copy.all],
      ] as const).map(([value, label]) => <CatalogFilterLink className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...persistentParams(props), availability: value === "all" ? undefined : value, ...attributeParams(attributeFilters) })} key={value}><span>{label}</span>{availability === value && <Check aria-label={copy.selected} className="size-4 text-emerald-700" />}</CatalogFilterLink>)}
    </CatalogFilterGroup>
    <CatalogFilterGroup title={copy.selections}>
      {([
        ["TOP", copy.popular],
        ["NEW", copy.newItems],
        ["HOT", copy.hotPrice],
      ] as const).map(([value, label]) => <CatalogFilterLink className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...selectionBaseParams(props), label: props.merchandisingLabel === value ? undefined : value, period: value === "TOP" && props.merchandisingLabel !== value ? String(props.period ?? 30) : undefined, ...attributeParams(attributeFilters) })} key={value}><span>{label}</span>{props.merchandisingLabel === value && <Check aria-label={copy.selected} className="size-4 text-emerald-700" />}</CatalogFilterLink>)}
      <CatalogFilterLink className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50" href={catalogHref({ ...selectionBaseParams(props), collection: props.collection ? undefined : "replenishment", ...attributeParams(attributeFilters) })}><span>{copy.replenishment}</span>{props.collection === "replenishment" && <Check aria-label={copy.selected} className="size-4 text-emerald-700" />}</CatalogFilterLink>
    </CatalogFilterGroup>
    <CatalogTechnicalFacetGroups facets={props.facets ?? []} hrefForSelection={(selection) => catalogHref({ ...baseParams(props), ...catalogFacetQueryFields(selection) })} selection={attributeFilters} />
  </CatalogFilterPanel>;
  return <CatalogFilterShell
    closeLabel={props.locale === "ro" ? "Închide filtrele" : "Закрыть фильтры"}
    panelLabel={props.locale === "ro" ? "Filtre catalog" : "Фильтры каталога"}
    selectedCount={selectedCount}
    triggerLabel={copy.filters}
  >{content}</CatalogFilterShell>;
}
function persistentParams(props: Props) { return { brand: props.brandId, category: props.categoryId, categories: categoryParam(props.categoryIds), categorySet: props.categorySet, collection: props.collection, label: props.merchandisingLabel, period: props.merchandisingLabel === "TOP" ? String(props.period ?? 30) : undefined, search: props.search, sort: props.sort && props.sort !== "default" ? props.sort : undefined, view: props.explicitAll ? "all" : undefined }; }
function baseParams(props: Props) { return { ...persistentParams(props), availability: props.availability && props.availability !== "all" ? props.availability : undefined }; }
function selectionBaseParams(props: Props) { return { brand: props.brandId, category: props.categoryId, categories: categoryParam(props.categoryIds), categorySet: props.categorySet, search: props.search, sort: props.sort && props.sort !== "default" ? props.sort : undefined, view: props.explicitAll ? "all" : undefined, availability: props.availability && props.availability !== "all" ? props.availability : undefined }; }
function clearParams(props: Props) { return { brand: props.brandId, category: props.categoryId, categories: categoryParam(props.categoryIds), categorySet: props.categorySet, search: props.search, sort: props.sort && props.sort !== "default" ? props.sort : undefined, view: props.explicitAll ? "all" : undefined }; }
function categoryParam(values: string[] | undefined): string | undefined { return values?.length ? values.join(",") : undefined; }
const attributeParams = catalogFacetQueryFields;
export function catalogHref(values: Record<string, string | undefined>) { const params = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); }); const query = params.toString(); return query ? `/cabinet/catalog?${query}` : "/cabinet/catalog"; }
