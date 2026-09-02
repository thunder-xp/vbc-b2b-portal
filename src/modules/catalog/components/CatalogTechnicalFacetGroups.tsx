import type { CatalogFacetSelection } from "../services/catalog-facet-state";
import { updateCatalogFacetSelection } from "../services/catalog-facet-state";
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
      const next = updateCatalogFacetSelection(selection, facet.key, value.value);
      return { count: value.count, href: hrefForSelection(next), selected, value: value.value };
    }),
  }));
  return <CatalogTechnicalFacetGroupsClient groups={groups} tone={tone} />;
}
