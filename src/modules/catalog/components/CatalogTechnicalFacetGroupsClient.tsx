"use client";

import Link from "next/link";

import { catalogFacetQueryFields, type CatalogFacetSelection, updateCatalogFacetSelection } from "../services/catalog-facet-state";
import { CatalogFilterGroup } from "./CatalogFilterPanel";

export type CatalogFacetGroupViewModel = {
  key: string;
  label: string;
  values: Array<{ count: number; selected: boolean; value: string }>;
};

export function CatalogTechnicalFacetGroupsClient({ baseHref, groups, selection, tone }: { baseHref: string; groups: CatalogFacetGroupViewModel[]; selection: CatalogFacetSelection; tone: "default" | "retail" }) {
  return <>{groups.map((facet) => <CatalogFilterGroup key={facet.key} title={facet.label}>
    {facet.values.map((item) => <Link
      className="catalog-facet-option"
      href={facetHref(baseHref, updateCatalogFacetSelection(selection, facet.key, item.value))}
      key={item.value}
      prefetch={false}
    >
      <span aria-hidden className={`catalog-facet-check ${item.selected ? tone === "retail" ? "catalog-facet-check-retail" : "catalog-facet-check-partner" : "border-zinc-300"}`} />
      <span className="catalog-facet-value">{item.value}</span>
      <span className="catalog-facet-count">{item.count}</span>
    </Link>)}
  </CatalogFilterGroup>)}</>;
}

function facetHref(baseHref: string, selection: CatalogFacetSelection): string {
  const [pathname, query = ""] = baseHref.split("?", 2);
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) if (key.startsWith("attr.")) params.delete(key);
  for (const [key, value] of Object.entries(catalogFacetQueryFields(selection))) params.set(key, value);
  const next = params.toString();
  return next ? `${pathname}?${next}` : pathname;
}
