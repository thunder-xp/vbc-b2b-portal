"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { repeatPurchaseHref } from "./repeat-purchase-query";

type Category = { id: string; name: string; productCount: number };

export function RepeatPurchaseCategoryFilters({
  allCount,
  allLabel,
  categories,
  search,
  selectedCategoryIds,
}: {
  allCount: number;
  allLabel: string;
  categories: Category[];
  search: string;
  selectedCategoryIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const navigate = (categoryId?: string) => {
    const nextCategoryIds = categoryId
      ? selectedCategoryIds.includes(categoryId)
        ? selectedCategoryIds.filter((id) => id !== categoryId)
        : [...selectedCategoryIds, categoryId]
      : [];
    startTransition(() => router.push(repeatPurchaseHref({ categoryIds: nextCategoryIds, search })));
  };

  return (
    <nav
      aria-busy={pending || undefined}
      aria-label={allLabel}
      className="flex max-w-full gap-2 overflow-x-auto pb-1"
      data-repeat-purchase-categories
    >
      <CategoryButton active={!selectedCategoryIds.length} count={allCount} label={allLabel} onClick={() => navigate()} />
      {categories.map((category) => (
        <CategoryButton
          active={selectedCategoryIds.includes(category.id)}
          count={category.productCount}
          key={category.id}
          label={category.name}
          onClick={() => navigate(category.id)}
        />
      ))}
    </nav>
  );
}

function CategoryButton({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={`${label} ${count}`}
      aria-pressed={active}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${active ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-500"}`}
      onClick={onClick}
      type="button"
    >
      {label}<span className="text-xs font-medium opacity-70">{count}</span>
    </button>
  );
}
