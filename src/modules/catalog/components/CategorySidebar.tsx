import Link from "next/link";

import type { CatalogCategoryDto } from "../services";

type CategorySidebarProps = {
  categories: CatalogCategoryDto[];
  selectedCategoryId?: string;
  brandId?: string;
  search?: string;
};

export function CategorySidebar({
  categories,
  selectedCategoryId,
  brandId,
  search,
}: CategorySidebarProps) {
  return (
    <aside className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Categories
      </h2>
      <nav className="mt-4 space-y-1">
        <CategoryLink
          brandId={brandId}
          hrefCategoryId={undefined}
          isActive={!selectedCategoryId}
          label="All categories"
          search={search}
        />
        {categories.map((category) => (
          <CategoryLink
            brandId={brandId}
            hrefCategoryId={category.id}
            isActive={selectedCategoryId === category.id}
            key={category.id}
            label={category.name}
            search={search}
          />
        ))}
      </nav>
    </aside>
  );
}

function CategoryLink({
  brandId,
  hrefCategoryId,
  isActive,
  label,
  search,
}: {
  brandId?: string;
  hrefCategoryId?: string;
  isActive: boolean;
  label: string;
  search?: string;
}) {
  const href = createCatalogHref({
    brand: brandId,
    category: hrefCategoryId,
    search,
  });

  return (
    <Link
      className={`block rounded-md px-3 py-2 text-sm ${
        isActive
          ? "bg-emerald-50 font-medium text-emerald-800"
          : "text-zinc-700 hover:bg-zinc-50"
      }`}
      href={href}
    >
      {label}
    </Link>
  );
}

function createCatalogHref(params: {
  brand?: string;
  category?: string;
  search?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.category) {
    searchParams.set("category", params.category);
  }

  if (params.brand) {
    searchParams.set("brand", params.brand);
  }

  if (params.search) {
    searchParams.set("search", params.search);
  }

  const query = searchParams.toString();
  return query ? `/cabinet/catalog?${query}` : "/cabinet/catalog";
}
