import type { ProductCommercialViewDto } from "../../pricing-inventory/services";
import type { CatalogProduct } from "../types";

export const CATALOG_SORT_OPTIONS = [
  { value: "default", label: "По умолчанию" },
  { value: "availability_asc", label: "По наличию А–Я" },
  { value: "availability_desc", label: "По наличию Я–А" },
  { value: "price_asc", label: "По цене А–Я" },
  { value: "price_desc", label: "По цене Я–А" },
  { value: "markup_asc", label: "По наценке А–Я" },
  { value: "markup_desc", label: "По наценке Я–А" },
] as const;

export type CatalogSort = (typeof CATALOG_SORT_OPTIONS)[number]["value"];

const catalogSortValues = new Set<CatalogSort>(
  CATALOG_SORT_OPTIONS.map((option) => option.value),
);

export function parseCatalogSort(value: string | undefined): CatalogSort {
  return value && catalogSortValues.has(value as CatalogSort)
    ? (value as CatalogSort)
    : "default";
}

export function requiresCommercialCatalogSort(sort: CatalogSort): boolean {
  return sort !== "default";
}

export function sortCatalogProducts(
  products: CatalogProduct[],
  commercialViews: ProductCommercialViewDto[],
  sort: CatalogSort,
): CatalogProduct[] {
  if (sort === "default") return [...products];

  const viewsByProductId = new Map(
    commercialViews.map((view) => [view.productId, view]),
  );
  const direction = sort.endsWith("_desc") ? -1 : 1;

  return [...products].sort((left, right) => {
    const primary = compareNullableNumbers(
      getSortValue(viewsByProductId.get(left.id), sort),
      getSortValue(viewsByProductId.get(right.id), sort),
      direction,
    );

    return primary || compareProducts(left, right);
  });
}

function getSortValue(
  view: ProductCommercialViewDto | undefined,
  sort: Exclude<CatalogSort, "default">,
): number | null {
  if (sort.startsWith("availability_")) {
    return finiteNumberOrNull(view?.stock?.exactAvailableQuantity);
  }
  if (sort.startsWith("price_")) {
    const amount = finiteNumberOrNull(view?.partnerPrice?.amount);
    return amount !== null && amount > 0 ? amount : null;
  }

  return finiteNumberOrNull(view?.commercialOpportunity?.markupPercent);
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  direction: 1 | -1,
): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

function compareProducts(left: CatalogProduct, right: CatalogProduct): number {
  return (
    left.name
      .trim()
      .toLocaleLowerCase("ru-RU")
      .localeCompare(right.name.trim().toLocaleLowerCase("ru-RU"), "ru-RU") ||
    left.id.localeCompare(right.id)
  );
}
