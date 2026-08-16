import type { PublicRetailCatalogMode, PublicRetailLocale } from "./types";
import { catalogFacetQueryFields, updateCatalogFacetSelection } from "../catalog/services/catalog-facet-state";

export type PublicRetailCatalogState = {
  q?: string;
  category?: string;
  availability?: string;
  attributeFilters: Record<string, string[]>;
  mode?: PublicRetailCatalogMode;
  page: number;
};

export function publicRetailFilterHref(
  locale: PublicRetailLocale,
  state: PublicRetailCatalogState,
  change: { availability?: string | null; category?: string | null; facet?: { key: string; value: string }; facetMode?: "include" | "toggle" },
): string {
  const query = new URLSearchParams({ lang: locale, page: "1" });
  const category = change.category === undefined ? state.category : change.category;
  const availability = change.availability === undefined ? state.availability : change.availability;
  if (state.q) query.set("q", state.q);
  if (category) query.set("category", category);
  if (availability) query.set("availability", availability);
  if (state.mode?.startsWith("price_")) query.set("sort", state.mode);
  else if (state.mode) query.set("view", state.mode);
  const nextFacets = change.facet
    ? updateCatalogFacetSelection(state.attributeFilters, change.facet.key, change.facet.value, change.facetMode)
    : state.attributeFilters;
  Object.entries(catalogFacetQueryFields(nextFacets)).forEach(([key, value]) => query.set(key, value));
  return `/catalog?${query}`;
}
