export type CatalogSortHiddenField = { name: string; value: string };

export function buildCatalogSortHiddenFields(input: {
  categoryId?: string;
  brandId?: string;
  search?: string;
  attributeFilters: Record<string, string[]>;
}): CatalogSortHiddenField[] {
  const fields: CatalogSortHiddenField[] = [];
  addTextField(fields, "category", input.categoryId);
  addTextField(fields, "brand", input.brandId);
  addTextField(fields, "search", input.search);
  for (const [key, values] of Object.entries(input.attributeFilters).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^property_[0-9a-f-]{36}$/.test(key)) continue;
    const normalizedValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    if (normalizedValues.length) fields.push({ name: `attr.${key}`, value: normalizedValues.join(",") });
  }
  return fields;
}

function addTextField(fields: CatalogSortHiddenField[], name: string, value: string | undefined): void {
  const normalized = value?.trim();
  if (normalized) fields.push({ name, value: normalized });
}
