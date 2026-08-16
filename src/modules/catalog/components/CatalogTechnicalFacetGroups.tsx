import type { CatalogFacetSelection } from "../services/catalog-facet-state";
import { updateCatalogFacetSelection } from "../services/catalog-facet-state";
import { CatalogFilterLink } from "./CatalogFilterLink";
import { CatalogFilterGroup } from "./CatalogFilterPanel";

type Facet = {
  key: string;
  label: string;
  values: Array<{ value: string; count: number; selected?: boolean }>;
};

export function CatalogTechnicalFacetGroups({
  facets,
  hrefForSelection,
  selection,
}: {
  facets: Facet[];
  hrefForSelection: (selection: CatalogFacetSelection) => string;
  selection: CatalogFacetSelection;
}) {
  return <>{facets.map((facet) => <CatalogFilterGroup key={facet.key} title={facet.label}>
    {facet.values.map((value) => {
      const selected = value.selected ?? selection[facet.key]?.includes(value.value) ?? false;
      const next = updateCatalogFacetSelection(selection, facet.key, value.value);
      return <CatalogFilterLink
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50"
        href={hrefForSelection(next)}
        key={value.value}
      >
        <span aria-hidden className={`size-4 rounded border ${selected ? "border-emerald-700 bg-emerald-700" : "border-zinc-300"}`} />
        <span className="min-w-0 flex-1 break-words">{value.value}</span>
        <span className="text-xs text-zinc-400">{value.count}</span>
      </CatalogFilterLink>;
    })}
  </CatalogFilterGroup>)}</>;
}
