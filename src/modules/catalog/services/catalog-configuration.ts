export type CatalogFilterDefinition = {
  code: string;
  label: string;
  kind: "multi_select" | "number_range" | "boolean";
  primary: boolean;
};

export type CatalogNavigationConfiguration = {
  visibleCategoryIds?: ReadonlySet<string>;
  categoryOrder?: readonly string[];
  categoryFilters?: Readonly<Record<string, readonly CatalogFilterDefinition[]>>;
  hiddenAttributeCodes?: ReadonlySet<string>;
  datasheetVisibility?: boolean;
};

export function resolveCategoryFilters(
  categoryId: string | undefined,
  configuration: CatalogNavigationConfiguration,
): CatalogFilterDefinition[] {
  if (!categoryId) return [];
  const hidden = configuration.hiddenAttributeCodes ?? new Set<string>();
  return (configuration.categoryFilters?.[categoryId] ?? [])
    .filter((definition) => !hidden.has(definition.code))
    .slice()
    .sort((left, right) => Number(right.primary) - Number(left.primary));
}
