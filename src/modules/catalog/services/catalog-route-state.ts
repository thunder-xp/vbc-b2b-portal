import type { MerchandisingLabelCode } from "../../merchandising/types";
import type { CatalogCollection } from "../types";
import type { CatalogAvailability } from "../components/CatalogFilters";
import { parseCatalogAttributeFilters } from "./catalog-sort-state";
import { parseCatalogSort, type CatalogSort } from "./catalog-sorting";
import { parseCatalogQuickLinkCode, type CatalogQuickLinkCode } from "./catalog-quick-links";
import { parseRollingPeriodState, resolveRollingPeriod, type NewRollingPeriod, type RollingPeriodState } from "../../commerce-period";

export type CatalogRouteMode = "curated" | "discovery";

export type CatalogRouteState = {
  attributeFilters: Record<string, string[]>;
  availability: CatalogAvailability;
  brandId?: string;
  collection?: CatalogCollection;
  categoryId?: string;
  categoryIds: string[];
  categorySet?: CatalogQuickLinkCode;
  explicitAll: boolean;
  merchandisingLabel?: MerchandisingLabelCode;
  mode: CatalogRouteMode;
  page: number;
  period: NewRollingPeriod;
  periodState?: RollingPeriodState;
  popularPeriodState?: RollingPeriodState;
  newPeriodState?: RollingPeriodState;
  hotPeriodState?: RollingPeriodState;
  search?: string;
  sort: CatalogSort;
};

type CatalogSearchParams = Record<string, string | string[] | undefined> | undefined;

export function parseCatalogRouteState(params: CatalogSearchParams): CatalogRouteState {
  const categoryId = parseIdentifier(single(params?.category));
  const categoryIds = categoryId ? [] : parseCategoryIds(params?.categories);
  const categorySet = categoryId || categoryIds.length ? undefined : parseCatalogQuickLinkCode(single(params?.categorySet));
  const brandId = parseIdentifier(single(params?.brand));
  const search = parseSearch(single(params?.search));
  const availability = parseAvailability(single(params?.availability));
  const collection = parseCollection(single(params?.collection));
  const merchandisingLabel = collection ? undefined : parseMerchandisingLabel(single(params?.label));
  const sort = parseCatalogSort(single(params?.sort));
  const attributeFilters = parseCatalogAttributeFilters(params);
  const explicitAll = single(params?.view) === "all";
  const periodState = parseRollingPeriodState(single(params?.period));
  const popularPeriodState = merchandisingLabel ? periodState : parseRollingPeriodState(single(params?.period));
  const newPeriodState = merchandisingLabel ? periodState : parseRollingPeriodState(single(params?.newPeriod));
  const hotPeriodState = merchandisingLabel ? periodState : parseRollingPeriodState(single(params?.hotPeriod));
  const period = resolveRollingPeriod(periodState);
  const hasDiscoveryConstraint = Boolean(
    explicitAll
      || categoryId
      || categoryIds.length
      || categorySet
      || brandId
      || collection
      || search
      || merchandisingLabel
      || availability !== "all"
      || sort !== "default"
      || Object.keys(attributeFilters).length,
  );

  return {
    attributeFilters,
    availability,
    brandId,
    collection,
    categoryId,
    categoryIds,
    categorySet,
    explicitAll,
    merchandisingLabel,
    mode: hasDiscoveryConstraint ? "discovery" : "curated",
    page: hasDiscoveryConstraint ? parsePage(single(params?.page)) : 1,
    period,
    periodState,
    popularPeriodState,
    newPeriodState,
    hotPeriodState,
    search,
    sort,
  };
}

export function parseCategoryIds(value: string | string[] | undefined): string[] {
  const values = (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => item.split(","));
  return [...new Set(values.map((item) => item.trim().toLowerCase()).filter((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item)))].sort().slice(0, 24);
}

function parseCollection(value: string | undefined): CatalogCollection | undefined {
  return value === "replenishment" ? value : undefined;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseIdentifier(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= 160 ? normalized : undefined;
}

function parseSearch(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= 200 ? normalized : undefined;
}

function parseAvailability(value: string | undefined): CatalogAvailability {
  return value === "in_stock" || value === "expected" ? value : "all";
}

function parseMerchandisingLabel(value: string | undefined): MerchandisingLabelCode | undefined {
  return value === "NEW" || value === "TOP" || value === "HOT" ? value : undefined;
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}
