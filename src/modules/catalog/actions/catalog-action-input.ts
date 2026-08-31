import type { CatalogProductListInput } from "../services";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import type { CatalogCollection } from "../types";

export function normalizeCatalogAvailability(
  value: CatalogProductListInput["availability"],
): "all" | "in_stock" | "expected" {
  return value === "in_stock" || value === "expected" ? value : "all";
}

export function normalizeCatalogFilters(
  filters: Record<string, string[]> | undefined,
): Record<string, string[]> | undefined {
  if (!filters) return undefined;
  return Object.entries(filters).reduce<Record<string, string[]>>((normalized, [key, values]) => {
    const normalizedKey = key.trim();
    const normalizedValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    if (normalizedKey && normalizedValues.length) normalized[normalizedKey] = normalizedValues;
    return normalized;
  }, {});
}

export function normalizeMerchandisingLabel(
  value: CatalogProductListInput["merchandisingLabel"],
): MerchandisingLabelCode | undefined {
  return value === "NEW" || value === "TOP" || value === "HOT"
    ? value
    : undefined;
}

export function normalizeCatalogCollection(
  value: CatalogProductListInput["collection"],
): CatalogCollection | undefined {
  return value === "replenishment" ? value : undefined;
}

export function normalizeCatalogOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function normalizeCatalogCategoryIds(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const normalized = [...new Set(values.filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))].slice(0, 3);
  return normalized.length ? normalized : undefined;
}
