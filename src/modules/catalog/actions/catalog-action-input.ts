import type { CatalogProductListInput } from "../services";

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

export function normalizeCatalogOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
