import type { PublicRetailLocale, PublicRetailMerchandisingMode, PublicRetailPriceSort } from "./types";
import { catalogFacetQueryFields, updateCatalogFacetSelection } from "../catalog/services/catalog-facet-state";

export type PublicRetailCatalogState = {
  q?: string;
  category?: string;
  availability?: string;
  attributeFilters: Record<string, string[]>;
  mode?: PublicRetailMerchandisingMode;
  sort?: PublicRetailPriceSort;
  returnHref?: string;
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
  if (state.sort) query.set("sort", state.sort);
  const nextFacets = change.facet
    ? updateCatalogFacetSelection(state.attributeFilters, change.facet.key, change.facet.value, change.facetMode)
    : state.attributeFilters;
  Object.entries(catalogFacetQueryFields(nextFacets)).forEach(([key, value]) => query.set(key, value));
  return `/catalog?${query}`;
}

export function publicRetailPlainCatalogHref(locale: PublicRetailLocale, state: PublicRetailCatalogState): string {
  const query = new URLSearchParams({ lang: locale, view: "all" });
  if (state.q) query.set("q", state.q);
  if (state.category) query.set("category", state.category);
  if (state.availability) query.set("availability", state.availability);
  if (state.sort) query.set("sort", state.sort);
  if (state.page > 1) query.set("page", String(state.page));
  Object.entries(catalogFacetQueryFields(state.attributeFilters)).forEach(([key, value]) => query.set(key, value));
  return `/catalog?${query}`;
}

export function publicRetailMerchandisingHref(
  locale: PublicRetailLocale,
  target: PublicRetailMerchandisingMode,
  state: PublicRetailCatalogState,
): string {
  if (state.mode === target) return state.returnHref ?? `/catalog?lang=${locale}&view=all`;
  const query = new URLSearchParams({
    lang: locale,
    view: target,
    return: state.returnHref ?? publicRetailPlainCatalogHref(locale, state),
  });
  return `/catalog?${query}`;
}

export function publicRetailCatalogReturnHref(locale: PublicRetailLocale, raw: string | undefined): string | undefined {
  if (!raw || raw.length > 2_000) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw, "https://www.nsd.md");
  } catch {
    return undefined;
  }
  if (parsed.origin !== "https://www.nsd.md" || parsed.pathname !== "/catalog") return undefined;
  const allowed = new Set(["lang", "view", "q", "category", "availability", "sort", "page"]);
  if ([...parsed.searchParams.keys()].some((key) => !allowed.has(key) && !/^attr\.property_[0-9a-f-]{36}$/.test(key))) return undefined;
  if (parsed.searchParams.get("lang") !== locale || ![null, "all"].includes(parsed.searchParams.get("view"))) return undefined;

  const category = parsed.searchParams.get("category") ?? undefined;
  const availability = parsed.searchParams.get("availability") ?? undefined;
  const sort = parsed.searchParams.get("sort") ?? undefined;
  const page = Number(parsed.searchParams.get("page") ?? "1");
  if (category && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) return undefined;
  if (availability && !["in_stock", "low_stock", "available_to_order", "unavailable", "unknown"].includes(availability)) return undefined;
  if (sort && sort !== "price_asc" && sort !== "price_desc") return undefined;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) return undefined;

  const attributeFilters: Record<string, string[]> = {};
  for (const [key, value] of parsed.searchParams) {
    if (!/^attr\.property_[0-9a-f-]{36}$/.test(key) || !value || value.length > 1_000) continue;
    attributeFilters[key.slice(5)] = value.split("|").filter(Boolean).slice(0, 20);
  }
  return publicRetailPlainCatalogHref(locale, {
    q: parsed.searchParams.get("q")?.trim().slice(0, 200) || undefined,
    category,
    availability,
    attributeFilters,
    sort: sort as PublicRetailPriceSort | undefined,
    page,
  });
}
