import Link from "next/link";

import type { CatalogBrandDto } from "../services";

type BrandFilterProps = {
  brands: CatalogBrandDto[];
  selectedBrandId?: string;
  categoryId?: string;
  search?: string;
};

export function BrandFilter({
  brands,
  selectedBrandId,
  categoryId,
  search,
}: BrandFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <BrandLink
        categoryId={categoryId}
        hrefBrandId={undefined}
        isActive={!selectedBrandId}
        label="All brands"
        search={search}
      />
      {brands.map((brand) => (
        <BrandLink
          categoryId={categoryId}
          hrefBrandId={brand.id}
          isActive={selectedBrandId === brand.id}
          key={brand.id}
          label={brand.name}
          search={search}
        />
      ))}
    </div>
  );
}

function BrandLink({
  categoryId,
  hrefBrandId,
  isActive,
  label,
  search,
}: {
  categoryId?: string;
  hrefBrandId?: string;
  isActive: boolean;
  label: string;
  search?: string;
}) {
  const searchParams = new URLSearchParams();

  if (categoryId) {
    searchParams.set("category", categoryId);
  }

  if (hrefBrandId) {
    searchParams.set("brand", hrefBrandId);
  }

  if (search) {
    searchParams.set("search", search);
  }

  const query = searchParams.toString();

  return (
    <Link
      className={`rounded-full border px-3 py-1.5 text-sm ${
        isActive
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-500"
      }`}
      href={query ? `/cabinet/catalog?${query}` : "/cabinet/catalog"}
    >
      {label}
    </Link>
  );
}
