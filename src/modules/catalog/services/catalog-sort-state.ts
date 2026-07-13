import type { CatalogSort } from "./catalog-sorting";

export type CatalogSortHiddenField = { name: string; value: string };

export function buildCatalogSortHiddenFields(input: {
  categoryId?: string;
  availability?: "all" | "in_stock" | "expected";
  search?: string;
  attributeFilters: Record<string, string[]>;
}): CatalogSortHiddenField[] {
  const fields: CatalogSortHiddenField[] = [];
  addTextField(fields, "category", input.categoryId);
  addTextField(fields, "search", input.search);
  if (input.availability === "in_stock" || input.availability === "expected") {
    fields.push({ name: "availability", value: input.availability });
  }
  for (const [key, values] of Object.entries(input.attributeFilters).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^property_[0-9a-f-]{36}$/.test(key)) continue;
    const normalizedValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    if (normalizedValues.length) fields.push({ name: `attr.${key}`, value: normalizedValues.join(",") });
  }
  return fields;
}

export function buildCatalogHref(input: {
  categoryId?: string;
  search?: string;
  availability?: "all" | "in_stock" | "expected";
  sort?: CatalogSort;
  attributeFilters?: Record<string, string[]>;
  page?: number;
}): string {
  const searchParams = new URLSearchParams();
  for (const field of buildCatalogSortHiddenFields({
    categoryId: input.categoryId,
    search: input.search,
    availability: input.availability,
    attributeFilters: input.attributeFilters ?? {},
  })) {
    searchParams.set(field.name, field.value);
  }
  if (input.sort && input.sort !== "default") searchParams.set("sort", input.sort);
  if (input.page && input.page > 1) searchParams.set("page", String(Math.floor(input.page)));

  const query = searchParams.toString();
  return query ? `/cabinet/catalog?${query}` : "/cabinet/catalog";
}

function addTextField(fields: CatalogSortHiddenField[], name: string, value: string | undefined): void {
  const normalized = value?.trim();
  if (normalized) fields.push({ name, value: normalized });
}
