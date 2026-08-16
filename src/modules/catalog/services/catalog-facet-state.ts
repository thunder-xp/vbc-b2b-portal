export type CatalogFacetSelection = Record<string, string[]>;

export function updateCatalogFacetSelection(
  selection: CatalogFacetSelection,
  key: string,
  value: string,
  mode: "include" | "toggle" = "toggle",
): CatalogFacetSelection {
  const current = selection[key] ?? [];
  const next = current.includes(value)
    ? mode === "include" ? current : current.filter((item) => item !== value)
    : [...current, value];

  return Object.fromEntries(
    Object.entries({ ...selection, [key]: next }).filter(([, values]) => values.length),
  );
}

export function catalogFacetQueryFields(
  selection: CatalogFacetSelection,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(selection)
      .filter(([, values]) => values.length)
      .map(([key, values]) => [`attr.${key}`, values.join(",")]),
  );
}
