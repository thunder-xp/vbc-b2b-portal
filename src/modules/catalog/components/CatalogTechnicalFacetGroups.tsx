import type { CatalogFacetSelection } from "../services/catalog-facet-state";
import { CatalogTechnicalFacetGroupsClient } from "./CatalogTechnicalFacetGroupsClient";

type Facet = {
  key: string;
  label: string;
  values: Array<{ value: string; count: number; selected?: boolean }>;
};

export function CatalogTechnicalFacetGroups({
  facets,
  hrefForSelection,
  selection,
  tone = "default",
}: {
  facets: Facet[];
  hrefForSelection: (selection: CatalogFacetSelection) => string;
  selection: CatalogFacetSelection;
  tone?: "default" | "retail";
}) {
  const groups = facets.map((facet) => ({
    key: facet.key,
    label: facet.label,
    values: facet.values.map((value) => {
      const selected = value.selected ?? selection[facet.key]?.includes(value.value) ?? false;
      return { count: value.count, selected, value: value.value };
    }),
  }));
  return <CatalogTechnicalFacetGroupsClient baseHref={hrefForSelection({})} groups={groups} selection={selection} tone={tone} />;
}
