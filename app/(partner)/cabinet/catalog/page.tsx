import Link from "next/link";

import {
  listCatalogBrandsAction,
  listCatalogCategoriesAction,
  listCatalogProductsAction,
} from "@/src/modules/catalog/actions";
import {
  BrandFilter,
  CategorySidebar,
  EmptyCatalog,
  ProductGrid,
  SearchBox,
} from "@/src/modules/catalog/components";

type CatalogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 12;

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const categoryId = getSingleParam(params?.category);
  const brandId = getSingleParam(params?.brand);
  const search = getSingleParam(params?.search);
  const page = parsePage(getSingleParam(params?.page));
  const [categoriesResult, brandsResult, productsResult] = await Promise.all([
    listCatalogCategoriesAction(),
    listCatalogBrandsAction(),
    listCatalogProductsAction({
      categoryId,
      brandId,
      search,
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);

  if (!categoriesResult.success) {
    return (
      <EmptyCatalog
        message={categoriesResult.message}
        title="Catalog unavailable"
      />
    );
  }

  if (!brandsResult.success) {
    return (
      <EmptyCatalog message={brandsResult.message} title="Catalog unavailable" />
    );
  }

  if (!productsResult.success) {
    return (
      <EmptyCatalog
        message={productsResult.message}
        title="Catalog unavailable"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-emerald-700">
            Product catalog
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Browse products
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Read-only product information for approved partner browsing.
          </p>
        </div>
        {productsResult.data.isDemoData && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800">
            Demo catalog
          </span>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <CategorySidebar
          brandId={brandId}
          categories={categoriesResult.data}
          search={search}
          selectedCategoryId={categoryId}
        />
        <section className="space-y-5">
          <SearchBox brandId={brandId} categoryId={categoryId} search={search} />
          <BrandFilter
            brands={brandsResult.data}
            categoryId={categoryId}
            search={search}
            selectedBrandId={brandId}
          />
          {productsResult.data.products.length > 0 ? (
            <>
              <ProductGrid products={productsResult.data.products} />
              <CatalogPagination
                brandId={brandId}
                categoryId={categoryId}
                hasNextPage={productsResult.data.hasNextPage}
                page={productsResult.data.page}
                search={search}
              />
            </>
          ) : (
            <EmptyCatalog
              message="No products match the selected catalog filters."
              title="No products found"
            />
          )}
        </section>
      </div>
    </div>
  );
}

function CatalogPagination({
  brandId,
  categoryId,
  hasNextPage,
  page,
  search,
}: {
  brandId?: string;
  categoryId?: string;
  hasNextPage: boolean;
  page: number;
  search?: string;
}) {
  if (page === 1 && !hasNextPage) {
    return null;
  }

  return (
    <nav className="flex items-center justify-between border-t border-zinc-200 pt-5">
      {page > 1 ? (
        <Link
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:border-emerald-500"
          href={createCatalogHref({
            brandId,
            categoryId,
            page: page - 1,
            search,
          })}
        >
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-zinc-500">Page {page}</span>
      {hasNextPage ? (
        <Link
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:border-emerald-500"
          href={createCatalogHref({
            brandId,
            categoryId,
            page: page + 1,
            search,
          })}
        >
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function createCatalogHref(params: {
  brandId?: string;
  categoryId?: string;
  page: number;
  search?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.categoryId) {
    searchParams.set("category", params.categoryId);
  }

  if (params.brandId) {
    searchParams.set("brand", params.brandId);
  }

  if (params.search) {
    searchParams.set("search", params.search);
  }

  if (params.page > 1) {
    searchParams.set("page", String(params.page));
  }

  const query = searchParams.toString();
  return query ? `/cabinet/catalog?${query}` : "/cabinet/catalog";
}

function getSingleParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value || undefined;
}

function parsePage(value: string | undefined): number {
  if (!value) {
    return 1;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}
