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
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50"
      href={facetHref(baseHref, updateCatalogFacetSelection(selection, facet.key, item.value))}
      key={item.value}
      prefetch={false}
    >
      <span aria-hidden className={`size-4 rounded border ${item.selected ? tone === "retail" ? "border-blue-700 bg-blue-700" : "border-emerald-700 bg-emerald-700" : "border-zinc-300"}`} />
      <span className="min-w-0 flex-1 break-words">{item.value}</span>
      <span className="text-xs text-zinc-400">{item.count}</span>
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
