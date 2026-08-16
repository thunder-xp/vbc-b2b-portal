import type { PublicRetailCatalogMode, PublicRetailLocale } from "./types";

export type PublicRetailCatalogState = {
  q?: string;
  category?: string;
  availability?: string;
  facets: Record<string, string[]>;
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
  const nextFacets = Object.fromEntries(Object.entries(state.facets).map(([key, values]) => [key, [...values]]));
  if (change.facet) {
    const values = nextFacets[change.facet.key] ?? [];
    nextFacets[change.facet.key] = values.includes(change.facet.value) && change.facetMode !== "include"
      ? values.filter((item) => item !== change.facet?.value)
      : [...values, change.facet.value];
  }
  Object.entries(nextFacets).forEach(([key, values]) => values.forEach((value) => query.append(`facet_${key}`, value)));
  return `/catalog?${query}`;
}
