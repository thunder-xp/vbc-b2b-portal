import Link from "next/link";

import type { CatalogQuickLink } from "../services";

type Props = {
  allCount?: number;
  allLabel: string;
  categories: CatalogQuickLink[];
  currentHref: string;
  selectedCategoryIds: string[];
};

export function PartnerTopCategoryFilterBar({ allCount, allLabel, categories, currentHref, selectedCategoryIds }: Props) {
  return <nav
    aria-label={allLabel}
    className="max-w-full overflow-x-auto pb-1"
    data-partner-top-category-filter-bar
  >
    <div className="flex min-w-max gap-2">
      <CategoryLink active={!selectedCategoryIds.length} count={allCount} href={buildTopCategoryHref(currentHref, [])} label={allLabel} />
      {categories.map((category) => {
        const active = category.categoryIds.every((id) => selectedCategoryIds.includes(id));
        return <CategoryLink
          active={active}
          count={category.productCount}
          href={buildTopCategoryHref(currentHref, toggleTopCategorySelection(selectedCategoryIds, category.categoryIds))}
          key={category.code}
          label={category.label}
        />;
      })}
    </div>
  </nav>;
}

export function toggleTopCategorySelection(selectedCategoryIds: string[], categoryIds: string[]): string[] {
  const selected = new Set(selectedCategoryIds);
  const active = categoryIds.every((id) => selected.has(id));
  for (const id of categoryIds) {
    if (active) selected.delete(id);
    else selected.add(id);
  }
  return [...selected].sort();
}

export function buildTopCategoryHref(currentHref: string, categoryIds: string[]): string {
  const current = new URL(currentHref, "https://partner.local");
  const params = new URLSearchParams(current.searchParams);
  params.delete("category");
  params.delete("categorySet");
  params.delete("categories");
  params.delete("page");
  if (categoryIds.length) params.set("categories", [...new Set(categoryIds)].sort().join(","));
  const query = params.toString();
  return `${current.pathname}${query ? `?${query}` : ""}`;
}

function CategoryLink({ active, count, href, label }: { active: boolean; count?: number; href: string; label: string }) {
  return <Link
    aria-current={active ? "page" : undefined}
    aria-label={typeof count === "number" ? `${label} ${count}` : label}
    className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-none border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${active ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-600 hover:text-emerald-800"}`}
    href={href}
    prefetch={false}
  >
    {label}{typeof count === "number" ? <span className="text-xs font-medium opacity-80">{count}</span> : null}
  </Link>;
}
