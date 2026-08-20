import { Suspense } from "react";
import Link from "next/link";

import { listCatalogFacetsAction } from "@/src/modules/catalog/actions/list-facets.action";
import type { listCatalogProductsAction } from "@/src/modules/catalog/actions/list-products.action";
import { CatalogFilters } from "@/src/modules/catalog/components/CatalogFilters";
import type { CatalogAvailability } from "@/src/modules/catalog/components/CatalogFilters";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import { CatalogPresentation } from "@/src/modules/catalog/components/CatalogPresentation";
import { RESTRICTED_PRODUCT_CARD_CAPABILITIES } from "@/src/modules/catalog/components/product-card.model";
import {
  buildCatalogHref,
  buildCatalogSortHiddenFields,
  CATALOG_SORT_OPTIONS,
  type CatalogCategoryDto,
  type CatalogSort,
  type CatalogViewMode,
} from "@/src/modules/catalog/services";
import type { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import type { ProductCommercialViewDto } from "@/src/modules/pricing-inventory";
import type { MerchandisingLabelCode } from "@/src/modules/merchandising/types";
import type { CatalogCollection } from "@/src/modules/catalog/types";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { CatalogPagination } from "@/src/modules/catalog/components/CatalogPagination";
import { CatalogResultsHeader } from "@/src/modules/catalog/components/CatalogPresentationPrimitives";

type Props = {
  attributeFilters: Record<string, string[]>;
  availability: CatalogAvailability;
  brandId?: string;
  categories: CatalogCategoryDto[];
  categoryId?: string;
  collection?: CatalogCollection;
  explicitAll: boolean;
  page: number;
  initialViewMode: CatalogViewMode;
  merchandisingLabel?: MerchandisingLabelCode;
  productsPromise: ReturnType<typeof listCatalogProductsAction>;
  search?: string;
  sort: CatalogSort;
  workspacePromise: ReturnType<typeof getPartnerWorkspaceContextAction>;
};

export async function CatalogResults({
  attributeFilters,
  availability,
  brandId,
  categories,
  categoryId,
  collection,
  explicitAll,
  page,
  initialViewMode,
  merchandisingLabel,
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
    return <EmptyCatalog message="Не удалось загрузить каталог. Обновите страницу или попробуйте немного позже." title="Каталог временно недоступен" />;
  }

  const commercialViews = createCommercialViewMap(productsResult.data.commercialViews ?? []);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const sortHiddenFields = buildCatalogSortHiddenFields({ brandId, categoryId, collection, explicitAll, availability, merchandisingLabel, search, attributeFilters });

  return <div className="space-y-6">
    <BehaviorViewEvent brandId={brandId} categoryId={categoryId} dedupeKey={`catalog:${categoryId ?? "all"}:${search ?? ""}:${availability}:${collection ?? merchandisingLabel ?? ""}:${page}`} eventName="catalog_viewed" resultCount={productsResult.data.totalCount} route="/cabinet/catalog" searchQuery={search} sourceSurface={collection === "replenishment" ? "warehouse_replenishment" : explicitAll ? "full_catalog" : "catalog_discovery"} />
    {categoryId ? <BehaviorViewEvent categoryId={categoryId} dedupeKey={`category:${categoryId}`} eventName="category_viewed" resultCount={productsResult.data.totalCount} route="/cabinet/catalog" sourceSurface="category" /> : null}
    {search ? <BehaviorViewEvent dedupeKey={`search:${search}:${productsResult.data.totalCount}`} eventName={productsResult.data.totalCount ? "search_performed" : "search_no_results"} resultCount={productsResult.data.totalCount} route="/cabinet/catalog" searchQuery={search} sourceSurface="catalog_search" /> : null}
    <CatalogResultsHeader action={<form action="/cabinet/catalog" className="w-full sm:w-auto">{sortHiddenFields.map((field) => <input key={field.name} name={field.name} type="hidden" value={field.value} />)}<label className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">Сортировка<select className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 sm:flex-none" defaultValue={sort} name="sort">{CATALOG_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button className="h-10 rounded-md border border-zinc-300 px-3 font-medium" type="submit">Применить</button></label></form>} countLabel={`Найдено товаров: ${productsResult.data.totalCount}`} title={selectedCategory?.name ?? (collection === "replenishment" ? "Последнее поступление" : "Каталог оборудования")} />
    {(search || selectedCategory || collection || merchandisingLabel || availability !== "all" || Object.keys(attributeFilters).length > 0) && <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-zinc-500">Активные фильтры:</span>{selectedCategory && <FilterChip href={buildCatalogHref({ brandId, collection, explicitAll, availability, merchandisingLabel, page: 1, search, sort, attributeFilters })} label={selectedCategory.name} />}{search && <FilterChip href={buildCatalogHref({ brandId, collection, explicitAll, availability, categoryId, merchandisingLabel, page: 1, sort, attributeFilters })} label={`Поиск: ${search}`} />}{collection && <FilterChip href={buildCatalogHref({ brandId, explicitAll, availability, categoryId, page: 1, search, sort, attributeFilters })} label="Пополнение" />}{merchandisingLabel && <FilterChip href={buildCatalogHref({ brandId, collection, explicitAll, availability, categoryId, page: 1, search, sort, attributeFilters })} label={merchandisingLabelName(merchandisingLabel)} />}{availability !== "all" && <FilterChip href={buildCatalogHref({ brandId, collection, explicitAll, categoryId, merchandisingLabel, page: 1, search, sort, attributeFilters })} label={availability === "in_stock" ? "В наличии" : "К поступлению"} />}{Object.entries(attributeFilters).flatMap(([key, values]) => values.map((value) => <FilterChip href={buildCatalogHref({ brandId, collection, explicitAll, availability, categoryId, merchandisingLabel, page: 1, search, sort, attributeFilters: withoutAttributeValue(attributeFilters, key, value) })} key={`${key}:${value}`} label={`Характеристика: ${value}`} />))}<Link className="text-sm font-medium text-emerald-700" href={explicitAll ? "/cabinet/catalog?view=all" : "/cabinet/catalog"} prefetch={false}>Очистить всё</Link></div>}
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Suspense fallback={<CatalogFacetFallback />}>
        <CatalogFacetResults attributeFilters={attributeFilters} availability={availability} brandId={brandId} categoryId={categoryId} collection={collection} explicitAll={explicitAll} merchandisingLabel={merchandisingLabel} search={search} sort={sort} />
      </Suspense>
      <section className="space-y-5">
        {productsResult.data.products.length > 0 ? <><CatalogPresentation capabilities={workspaceContextResult.success ? workspaceContextResult.data.capabilities.productCard : RESTRICTED_PRODUCT_CARD_CAPABILITIES} commercialViews={commercialViews} companyId={workspaceContextResult.success ? workspaceContextResult.data.companyId : null} contextBadge={collection === "replenishment" ? "Пополнение" : undefined} initialMode={initialViewMode} products={productsResult.data.products} userId={workspaceContextResult.success ? workspaceContextResult.data.userId : null} /><CatalogPagination availability={availability} brandId={brandId} categoryId={categoryId} collection={collection} explicitAll={explicitAll} merchandisingLabel={merchandisingLabel} page={productsResult.data.page} pageSize={productsResult.data.pageSize} search={search} sort={sort} totalCount={productsResult.data.totalCount} attributeFilters={attributeFilters} /></> : <EmptyCatalog message={search ? "По вашему запросу товары не найдены." : "В выбранной категории пока нет товаров."} title="Товары не найдены" />}
      </section>
    </div>
  </div>;
}

export async function CatalogFacetResults({
  attributeFilters,
  availability,
  categoryId,
  collection,
  merchandisingLabel,
  search,
  sort,
  brandId,
  explicitAll,
}: Pick<Props, "attributeFilters" | "availability" | "brandId" | "categoryId" | "collection" | "explicitAll" | "merchandisingLabel" | "search" | "sort">) {
  const result = await listCatalogFacetsAction({
    attributeFilters,
    availability,
    brandId,
    categoryId,
    collection,
    merchandisingLabel,
    search,
  });
  return <CatalogFilters
    attributeFilters={attributeFilters}
    availability={availability}
    brandId={brandId}
    categoryId={categoryId}
    collection={collection}
    explicitAll={explicitAll}
    merchandisingLabel={merchandisingLabel}
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

function withoutAttributeValue(filters: Record<string, string[]>, key: string, value: string): Record<string, string[]> { const next = Object.fromEntries(Object.entries(filters).map(([entryKey, values]) => [entryKey, values.filter((item) => entryKey !== key || item !== value)])); return Object.fromEntries(Object.entries(next).filter(([, values]) => values.length)); }
function FilterChip({ href, label }: { href: string; label: string }) { return <Link className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-zinc-700 hover:border-emerald-500" href={href} prefetch={false}>{label} ×</Link>; }
function createCommercialViewMap(views: ProductCommercialViewDto[]): Record<string, ProductCommercialViewDto> { return Object.fromEntries(views.map((view) => [view.productId, view])); }
function merchandisingLabelName(label: MerchandisingLabelCode): string { return label === "TOP" ? "Популярные" : label === "NEW" ? "Новинки" : "Горячие предложения"; }
