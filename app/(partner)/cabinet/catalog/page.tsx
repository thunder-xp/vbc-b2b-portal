import Link from "next/link";

import {
  listCatalogCategoriesAction,
  listCatalogProductsAction,
} from "@/src/modules/catalog/actions";
import {
  CatalogBreadcrumb,
  CatalogFilters,
  CatalogSearch,
  CategoryMegaMenu,
  EmptyCatalog,
  ProductGrid,
  RESTRICTED_PRODUCT_CARD_CAPABILITIES,
} from "@/src/modules/catalog/components";
import { getProductCommercialViewsAction } from "@/src/modules/pricing-inventory/actions";
import type { ProductCommercialViewDto } from "@/src/modules/pricing-inventory";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { buildCatalogSortHiddenFields } from "@/src/modules/catalog/services";
import type { CatalogAvailability } from "@/src/modules/catalog/components/CatalogFilters";

type CatalogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 12;

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const categoryId = getSingleParam(params?.category);
  const search = getSingleParam(params?.search);
  const availability = parseAvailability(getSingleParam(params?.availability));
  const sort = parseSort(getSingleParam(params?.sort));
  const page = parsePage(getSingleParam(params?.page));
  const attributeFilters = parseAttributeFilters(params);
  const [categoriesResult, productsResult, workspaceContextResult] = await Promise.all([
    listCatalogCategoriesAction(),
    listCatalogProductsAction({
      categoryId,
      search,
      availability,
      page,
      pageSize: PAGE_SIZE,
      sort,
      attributeFilters,
    }),
    getPartnerWorkspaceContextAction(),
  ]);

  if (!categoriesResult.success) {
    return (
      <EmptyCatalog
        message={categoriesResult.message}
        title="Catalog unavailable"
      />
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

  const commercialViewsResult = await getProductCommercialViewsAction(
    productsResult.data.products.map((product) => product.id),
  );
  const commercialViews = commercialViewsResult.success
    ? createCommercialViewMap(commercialViewsResult.data)
    : {};
  const selectedCategory = categoriesResult.data.find((category) => category.id === categoryId);
  const sortHiddenFields = buildCatalogSortHiddenFields({ categoryId, availability, search, attributeFilters });

  return (
    <div className="space-y-6">
      <div className="flex gap-3"><CategoryMegaMenu categories={categoriesResult.data} /><CatalogSearch categoryId={categoryId} initialSearch={search} /></div>
      <CatalogBreadcrumb categories={categoriesResult.data} selectedId={categoryId} />
      <section className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-semibold text-zinc-950">{selectedCategory?.name ?? "Каталог оборудования"}</h1><p className="mt-1 text-sm text-zinc-500">Найдено товаров: {productsResult.data.totalCount}</p></div>
        <form action="/cabinet/catalog">{sortHiddenFields.map((field) => <input key={field.name} name={field.name} type="hidden" value={field.value} />)}<label className="flex items-center gap-2 text-sm text-zinc-600">Сортировка<select className="h-10 rounded-md border border-zinc-300 bg-white px-3" defaultValue={sort} name="sort"><option value="default">По умолчанию</option><option value="name_asc">Название: А–Я</option><option value="name_desc">Название: Я–А</option><option value="sku_asc">По SKU</option></select><button className="h-10 rounded-md border border-zinc-300 px-3 font-medium" type="submit">Применить</button></label></form>
      </section>
      {(search || selectedCategory || availability !== "all") && <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-zinc-500">Активные фильтры:</span>{selectedCategory && <FilterChip href={createCatalogHref({ availability, page: 1, search, sort, attributeFilters })} label={selectedCategory.name} />}{search && <FilterChip href={createCatalogHref({ availability, categoryId, page: 1, sort, attributeFilters })} label={`Поиск: ${search}`} />}{availability !== "all" && <FilterChip href={createCatalogHref({ categoryId, page: 1, search, sort, attributeFilters })} label={availability === "in_stock" ? "В наличии" : "К поступлению"} />}<Link className="text-sm font-medium text-emerald-700" href="/cabinet/catalog">Очистить всё</Link></div>}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <CatalogFilters attributeFilters={attributeFilters} availability={availability} categoryId={categoryId} facets={productsResult.data.facets} search={search} sort={sort} />
        <section className="space-y-5">
          {productsResult.data.products.length > 0 ? (
            <>
              <ProductGrid
                capabilities={workspaceContextResult.success ? workspaceContextResult.data.capabilities.productCard : RESTRICTED_PRODUCT_CARD_CAPABILITIES}
                commercialViews={commercialViews}
                products={productsResult.data.products}
              />
              <CatalogPagination
                availability={availability}
                categoryId={categoryId}
                hasNextPage={productsResult.data.hasNextPage}
                page={productsResult.data.page}
                search={search}
                sort={sort}
                attributeFilters={attributeFilters}
              />
            </>
          ) : (
            <EmptyCatalog
              message={search ? "По вашему запросу товары не найдены." : "В выбранной категории пока нет товаров."}
              title="Товары не найдены"
            />
          )}
        </section>
      </div>
    </div>
  );
}

function CatalogPagination({
  availability,
  categoryId,
  hasNextPage,
  page,
  search,
  sort,
  attributeFilters,
}: {
  availability: CatalogAvailability;
  categoryId?: string;
  hasNextPage: boolean;
  page: number;
  search?: string;
  sort?: string;
  attributeFilters: Record<string, string[]>;
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
            availability,
            categoryId,
            page: page - 1,
            search,
          sort,
          attributeFilters,
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
            availability,
            categoryId,
            page: page + 1,
            search,
            sort,
            attributeFilters,
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
  availability?: CatalogAvailability;
  categoryId?: string;
  page: number;
  search?: string;
  sort?: string;
  attributeFilters?: Record<string, string[]>;
}) {
  const searchParams = new URLSearchParams();

  if (params.categoryId) {
    searchParams.set("category", params.categoryId);
  }

  if (params.search) {
    searchParams.set("search", params.search);
  }
  if (params.availability && params.availability !== "all") searchParams.set("availability", params.availability);
  if (params.sort && params.sort !== "default") searchParams.set("sort", params.sort);
  for (const [key, values] of Object.entries(params.attributeFilters ?? {})) if (values.length) searchParams.set(`attr.${key}`, values.join(","));

  if (params.page > 1) {
    searchParams.set("page", String(params.page));
  }

  const query = searchParams.toString();
  return query ? `/cabinet/catalog?${query}` : "/cabinet/catalog";
}

function parseAttributeFilters(params: Record<string, string | string[] | undefined> | undefined): Record<string, string[]> { return Object.fromEntries(Object.entries(params ?? {}).flatMap(([key, value]) => { if (!key.startsWith("attr.")) return []; const raw = Array.isArray(value) ? value.join(",") : value ?? ""; const values = raw.split(",").map((item) => item.trim()).filter(Boolean); return values.length ? [[key.slice(5), values]] : []; })); }

function parseSort(value: string | undefined): "default" | "name_asc" | "name_desc" | "sku_asc" { return value === "name_asc" || value === "name_desc" || value === "sku_asc" ? value : "default"; }

function parseAvailability(value: string | undefined): CatalogAvailability { return value === "in_stock" || value === "expected" ? value : "all"; }

function FilterChip({ href, label }: { href: string; label: string }) { return <Link className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-zinc-700 hover:border-emerald-500" href={href}>{label} ×</Link>; }

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

function createCommercialViewMap(
  commercialViews: ProductCommercialViewDto[],
): Record<string, ProductCommercialViewDto> {
  return Object.fromEntries(
    commercialViews.map((commercialView) => [
      commercialView.productId,
      commercialView,
    ]),
  );
}
