import { Suspense } from "react";
import Link from "next/link";

import type { listCatalogFacetsAction } from "@/src/modules/catalog/actions/list-facets.action";
import type { listCatalogProductsAction } from "@/src/modules/catalog/actions/list-products.action";
import { CatalogFilters } from "@/src/modules/catalog/components/CatalogFilters";
import type { CatalogAvailability } from "@/src/modules/catalog/components/CatalogFilters";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import { ProductGrid } from "@/src/modules/catalog/components/ProductGrid";
import { RESTRICTED_PRODUCT_CARD_CAPABILITIES } from "@/src/modules/catalog/components/product-card.model";
import {
  buildCatalogHref,
  buildCatalogSortHiddenFields,
  CATALOG_SORT_OPTIONS,
  type CatalogCategoryDto,
  type CatalogSort,
} from "@/src/modules/catalog/services";
import type { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import type { ProductCommercialViewDto } from "@/src/modules/pricing-inventory";
import { evaluateFreshness } from "@/src/modules/integration/freshness";

type Props = {
  attributeFilters: Record<string, string[]>;
  availability: CatalogAvailability;
  categories: CatalogCategoryDto[];
  categoryId?: string;
  facetsPromise: ReturnType<typeof listCatalogFacetsAction>;
  page: number;
  productsPromise: ReturnType<typeof listCatalogProductsAction>;
  search?: string;
  sort: CatalogSort;
  workspacePromise: ReturnType<typeof getPartnerWorkspaceContextAction>;
};

export async function CatalogResults({
  attributeFilters,
  availability,
  categories,
  categoryId,
  facetsPromise,
  page,
  productsPromise,
  search,
  sort,
  workspacePromise,
}: Props) {
  const [productsResult, workspaceContextResult] = await Promise.all([
    productsPromise,
    workspacePromise,
  ]);

  if (!productsResult.success) {
    return <EmptyCatalog message={productsResult.message} title="Catalog unavailable" />;
  }

  const commercialViews = createCommercialViewMap(productsResult.data.commercialViews ?? []);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const sortHiddenFields = buildCatalogSortHiddenFields({ categoryId, availability, search, attributeFilters });
  const stockUpdatedAt = latestTimestamp(Object.values(commercialViews).map((view) => view.stock?.lastUpdatedAt));
  const stockFreshness = stockUpdatedAt ? evaluateFreshness(stockUpdatedAt, "stock", "Остатки") : null;
  const arrivalUpdatedAt = latestTimestamp(Object.values(commercialViews).map((view) => view.stock?.expectedArrival ? view.stock.lastUpdatedAt : null));
  const arrivalFreshness = arrivalUpdatedAt ? evaluateFreshness(arrivalUpdatedAt, "stock", "Ожидаемые поступления") : null;
  const priceUpdatedAt = latestTimestamp(Object.values(commercialViews).map((view) => view.partnerPrice?.lastUpdatedAt));
  const priceFreshness = priceUpdatedAt ? evaluateFreshness(priceUpdatedAt, "price", "Цены") : null;

  return <div className="space-y-6">
    {stockFreshness || arrivalFreshness || priceFreshness ? <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">{stockFreshness ? <p>{stockFreshness.label}</p> : null}{arrivalFreshness ? <p>{arrivalFreshness.label}</p> : null}{priceFreshness ? <p>{priceFreshness.label}</p> : null}{stockFreshness?.staleNotice || priceFreshness?.staleNotice ? <p className="w-full text-amber-700">Показаны последние подтверждённые данные</p> : null}</div> : null}
    <section className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-semibold text-zinc-950">{selectedCategory?.name ?? "Каталог оборудования"}</h1><p className="mt-1 text-sm text-zinc-500">Найдено товаров: {productsResult.data.totalCount}</p></div>
      <form action="/cabinet/catalog" className="w-full sm:w-auto">{sortHiddenFields.map((field) => <input key={field.name} name={field.name} type="hidden" value={field.value} />)}<label className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">Сортировка<select className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 sm:flex-none" defaultValue={sort} name="sort">{CATALOG_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button className="h-10 rounded-md border border-zinc-300 px-3 font-medium" type="submit">Применить</button></label></form>
    </section>
    {(search || selectedCategory || availability !== "all" || Object.keys(attributeFilters).length > 0) && <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-zinc-500">Активные фильтры:</span>{selectedCategory && <FilterChip href={buildCatalogHref({ availability, page: 1, search, sort, attributeFilters })} label={selectedCategory.name} />}{search && <FilterChip href={buildCatalogHref({ availability, categoryId, page: 1, sort, attributeFilters })} label={`Поиск: ${search}`} />}{availability !== "all" && <FilterChip href={buildCatalogHref({ categoryId, page: 1, search, sort, attributeFilters })} label={availability === "in_stock" ? "В наличии" : "К поступлению"} />}{Object.entries(attributeFilters).flatMap(([key, values]) => values.map((value) => <FilterChip href={buildCatalogHref({ availability, categoryId, page: 1, search, sort, attributeFilters: withoutAttributeValue(attributeFilters, key, value) })} key={`${key}:${value}`} label={`Характеристика: ${value}`} />))}<Link className="text-sm font-medium text-emerald-700" href="/cabinet/catalog" prefetch={false}>Очистить всё</Link></div>}
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Suspense fallback={<CatalogFacetFallback />}>
        <CatalogFacetResults attributeFilters={attributeFilters} availability={availability} categoryId={categoryId} facetsPromise={facetsPromise} search={search} sort={sort} />
      </Suspense>
      <section className="space-y-5">
        {productsResult.data.products.length > 0 ? <><ProductGrid capabilities={workspaceContextResult.success ? workspaceContextResult.data.capabilities.productCard : RESTRICTED_PRODUCT_CARD_CAPABILITIES} commercialViews={commercialViews} products={productsResult.data.products} /><CatalogPagination availability={availability} categoryId={categoryId} hasNextPage={productsResult.data.hasNextPage} page={page} search={search} sort={sort} attributeFilters={attributeFilters} /></> : <EmptyCatalog message={search ? "По вашему запросу товары не найдены." : "В выбранной категории пока нет товаров."} title="Товары не найдены" />}
      </section>
    </div>
  </div>;
}

export async function CatalogFacetResults({
  attributeFilters,
  availability,
  categoryId,
  facetsPromise,
  search,
  sort,
}: Pick<Props, "attributeFilters" | "availability" | "categoryId" | "facetsPromise" | "search" | "sort">) {
  const result = await facetsPromise;
  return <CatalogFilters
    attributeFilters={attributeFilters}
    availability={availability}
    categoryId={categoryId}
    facets={result.success ? result.data : []}
    search={search}
    sort={sort}
  />;
}

function CatalogFacetFallback() {
  return <aside aria-busy="true" aria-label="Фильтры загружаются" className="min-h-80 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
    <div className="h-10 animate-pulse rounded bg-zinc-100" />
    <div className="mt-5 space-y-4">{Array.from({ length: 5 }, (_, index) => <div className="h-9 animate-pulse rounded bg-zinc-100" key={index} />)}</div>
  </aside>;
}

function CatalogPagination({ availability, categoryId, hasNextPage, page, search, sort, attributeFilters }: { availability: CatalogAvailability; categoryId?: string; hasNextPage: boolean; page: number; search?: string; sort: CatalogSort; attributeFilters: Record<string, string[]> }) {
  if (page === 1 && !hasNextPage) return null;
  return <nav className="flex items-center justify-between border-t border-zinc-200 pt-5">{page > 1 ? <Link className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:border-emerald-500" href={buildCatalogHref({ availability, categoryId, page: page - 1, search, sort, attributeFilters })} prefetch={false}>Назад</Link> : <span />}<span className="text-sm text-zinc-500">Страница {page}</span>{hasNextPage ? <Link className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:border-emerald-500" href={buildCatalogHref({ availability, categoryId, page: page + 1, search, sort, attributeFilters })} prefetch={false}>Далее</Link> : <span />}</nav>;
}

function withoutAttributeValue(filters: Record<string, string[]>, key: string, value: string): Record<string, string[]> { const next = Object.fromEntries(Object.entries(filters).map(([entryKey, values]) => [entryKey, values.filter((item) => entryKey !== key || item !== value)])); return Object.fromEntries(Object.entries(next).filter(([, values]) => values.length)); }
function FilterChip({ href, label }: { href: string; label: string }) { return <Link className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-zinc-700 hover:border-emerald-500" href={href} prefetch={false}>{label} ×</Link>; }
function createCommercialViewMap(views: ProductCommercialViewDto[]): Record<string, ProductCommercialViewDto> { return Object.fromEntries(views.map((view) => [view.productId, view])); }
function latestTimestamp(values: Array<string | null | undefined>): string | null { const timestamps = values.flatMap((value) => value && Number.isFinite(Date.parse(value)) ? [Date.parse(value)] : []); return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null; }
