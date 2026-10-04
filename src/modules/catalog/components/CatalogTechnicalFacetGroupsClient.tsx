"use client";

import Link from "next/link";

import { catalogFacetQueryFields, type CatalogFacetSelection, updateCatalogFacetSelection } from "../services/catalog-facet-state";
import { catalogFilterOptionClassName, CatalogFilterGroup } from "./CatalogFilterPanel";

export type CatalogFacetGroupViewModel = {
  key: string;
  label: string;
  values: Array<{ count: number; selected: boolean; value: string }>;
};

export function CatalogTechnicalFacetGroupsClient({ baseHref, groups, selection, tone }: { baseHref: string; groups: CatalogFacetGroupViewModel[]; selection: CatalogFacetSelection; tone: "default" | "retail" }) {
  const compact = tone === "default";
  return <>{groups.map((facet) => <CatalogFilterGroup compact={compact} key={facet.key} title={facet.label}>
    {facet.values.map((item) => <Link
      className={`${catalogFilterOptionClassName(item.selected, compact)} gap-2`}
      href={facetHref(baseHref, updateCatalogFacetSelection(selection, facet.key, item.value))}
      key={item.value}
      prefetch={false}
    >
      <span aria-hidden className={`size-4 rounded border ${compact ? "shrink-0 self-center" : ""} ${item.selected ? tone === "retail" ? "border-blue-700 bg-blue-700" : "border-emerald-700 bg-emerald-700" : "border-zinc-300"}`} />
      <span className="min-w-0 flex-1 break-words">{item.value}</span>
      <span className={compact ? "shrink-0 text-[11px] font-medium leading-[1.35] text-zinc-500 tabular-nums" : "text-xs text-zinc-400"}>{item.count}</span>
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
