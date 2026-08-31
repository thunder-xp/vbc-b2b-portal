import { Suspense } from "react";
import Link from "next/link";

import { listCatalogFacetsAction } from "@/src/modules/catalog/actions/list-facets.action";
import type { listCatalogProductsAction } from "@/src/modules/catalog/actions/list-products.action";
import { CatalogFilters } from "@/src/modules/catalog/components/CatalogFilters";
import type { CatalogAvailability } from "@/src/modules/catalog/components/CatalogFilters";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import { CatalogPresentation } from "@/src/modules/catalog/components/CatalogPresentation";
import { CatalogQuickLinks } from "@/src/modules/catalog/components/CatalogQuickLinks";
import { RESTRICTED_PRODUCT_CARD_CAPABILITIES } from "@/src/modules/catalog/components/product-card.model";
import {
  buildCatalogHref,
  type CatalogCategoryDto,
  type CatalogQuickLinkCode,
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
import { getCatalogCopy, type PartnerLocale } from "@/src/modules/partner-locale";

type Props = {
  attributeFilters: Record<string, string[]>;
  availability: CatalogAvailability;
  brandId?: string;
  categories: CatalogCategoryDto[];
  categoryId?: string;
  categoryIds?: string[];
  categorySet?: CatalogQuickLinkCode;
  collection?: CatalogCollection;
  explicitAll: boolean;
  page: number;
  initialViewMode: CatalogViewMode;
  merchandisingLabel?: MerchandisingLabelCode;
  locale: PartnerLocale;
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
  categoryIds,
  categorySet,
  collection,
  explicitAll,
  page,
  initialViewMode,
  merchandisingLabel,
  locale,
  productsPromise,
  search,
  sort,
  workspacePromise,
}: Props) {
  const copy = getCatalogCopy(locale);
  const [productsResult, workspaceContextResult] = await Promise.all([
    productsPromise,
    workspacePromise,
  ]);

  if (!productsResult.success) {
    return <EmptyCatalog message={copy.unavailableMessage} title={copy.unavailableTitle} />;
  }

  const commercialViews = createCommercialViewMap(productsResult.data.commercialViews ?? []);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const resultsTitle = selectedCategory?.name ?? (categorySet ? undefined : collection === "replenishment" ? copy.latestArrival : null);

  return <div className="space-y-6">
    <BehaviorViewEvent brandId={brandId} categoryId={categoryId} dedupeKey={`catalog:${categoryId ?? categorySet ?? "all"}:${search ?? ""}:${availability}:${collection ?? merchandisingLabel ?? ""}:${page}`} eventName="catalog_viewed" resultCount={productsResult.data.totalCount} route="/cabinet/catalog" searchQuery={search} sourceSurface={collection === "replenishment" ? "warehouse_replenishment" : explicitAll ? "full_catalog" : "catalog_discovery"} />
    {categoryId ? <BehaviorViewEvent categoryId={categoryId} dedupeKey={`category:${categoryId}`} eventName="category_viewed" resultCount={productsResult.data.totalCount} route="/cabinet/catalog" sourceSurface="category" /> : null}
    {search ? <BehaviorViewEvent dedupeKey={`search:${search}:${productsResult.data.totalCount}`} eventName={productsResult.data.totalCount ? "search_performed" : "search_no_results"} resultCount={productsResult.data.totalCount} route="/cabinet/catalog" searchQuery={search} sourceSurface="catalog_search" /> : null}
    {resultsTitle ? <CatalogResultsHeader title={resultsTitle} /> : null}
    {(search || selectedCategory || categorySet || collection || merchandisingLabel || availability !== "all" || Object.keys(attributeFilters).length > 0) && <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-zinc-500">{copy.activeFilters}:</span>{selectedCategory && <FilterChip href={buildCatalogHref({ brandId, collection, explicitAll, availability, merchandisingLabel, page: 1, search, sort, attributeFilters })} label={selectedCategory.name} />}{categorySet && <FilterChip href={buildCatalogHref({ brandId, collection, explicitAll, availability, merchandisingLabel, page: 1, search, sort, attributeFilters })} label={copy.categories} />}{search && <FilterChip href={buildCatalogHref({ brandId, categorySet, collection, explicitAll, availability, categoryId, merchandisingLabel, page: 1, sort, attributeFilters })} label={`${copy.searchFilter}: ${search}`} />}{collection && <FilterChip href={buildCatalogHref({ brandId, categorySet, explicitAll, availability, categoryId, page: 1, search, sort, attributeFilters })} label={copy.replenishment} />}{merchandisingLabel && <FilterChip href={buildCatalogHref({ brandId, categorySet, collection, explicitAll, availability, categoryId, page: 1, search, sort, attributeFilters })} label={merchandisingLabelName(merchandisingLabel, copy)} />}{availability !== "all" && <FilterChip href={buildCatalogHref({ brandId, categorySet, collection, explicitAll, categoryId, merchandisingLabel, page: 1, search, sort, attributeFilters })} label={availability === "in_stock" ? copy.inStock : copy.expected} />}{Object.entries(attributeFilters).flatMap(([key, values]) => values.map((value) => <FilterChip href={buildCatalogHref({ brandId, categorySet, collection, explicitAll, availability, categoryId, merchandisingLabel, page: 1, search, sort, attributeFilters: withoutAttributeValue(attributeFilters, key, value) })} key={`${key}:${value}`} label={`${copy.characteristicFilter}: ${value}`} />))}<Link className="text-sm font-medium text-emerald-700" href={explicitAll ? "/cabinet/catalog?view=all" : "/cabinet/catalog"} prefetch={false}>{copy.clearAll}</Link></div>}
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Suspense fallback={<CatalogFacetFallback copy={copy} />}>
        <CatalogFacetResults attributeFilters={attributeFilters} availability={availability} brandId={brandId} categoryId={categoryId} categoryIds={categoryIds} categorySet={categorySet} collection={collection} explicitAll={explicitAll} locale={locale} merchandisingLabel={merchandisingLabel} search={search} sort={sort} />
      </Suspense>
      <section className="space-y-5">
        <CatalogPresentation capabilities={workspaceContextResult.success ? workspaceContextResult.data.capabilities.productCard : RESTRICTED_PRODUCT_CARD_CAPABILITIES} catalogState={{ attributeFilters, availability, brandId, categoryId, categorySet, collection, explicitAll, merchandisingLabel, page, search, sort }} commercialViews={commercialViews} companyId={workspaceContextResult.success ? workspaceContextResult.data.companyId : null} contextBadge={collection === "replenishment" ? copy.replenishment : undefined} emptyState={<EmptyCatalog message={search ? copy.noSearchResults : copy.noCategoryProducts} title={copy.notFoundTitle} />} initialMode={initialViewMode} products={productsResult.data.products} quickLinks={<CatalogQuickLinks categories={categories} locale={locale} state={{ attributeFilters, availability, brandId, categoryId, categorySet, collection, explicitAll, merchandisingLabel, mode: "discovery", page, search, sort }} />} userId={workspaceContextResult.success ? workspaceContextResult.data.userId : null} />
        {productsResult.data.products.length > 0 ? <CatalogPagination availability={availability} brandId={brandId} categoryId={categoryId} categorySet={categorySet} collection={collection} explicitAll={explicitAll} merchandisingLabel={merchandisingLabel} locale={locale} page={productsResult.data.page} pageSize={productsResult.data.pageSize} search={search} sort={sort} totalCount={productsResult.data.totalCount} attributeFilters={attributeFilters} /> : null}
      </section>
    </div>
  </div>;
}

export async function CatalogFacetResults({
  attributeFilters,
  availability,
  categoryId,
  categoryIds,
  categorySet,
  collection,
  locale,
  merchandisingLabel,
  search,
  sort,
  brandId,
  explicitAll,
}: Pick<Props, "attributeFilters" | "availability" | "brandId" | "categoryId" | "categoryIds" | "categorySet" | "collection" | "explicitAll" | "locale" | "merchandisingLabel" | "search" | "sort">) {
  const result = await listCatalogFacetsAction({
    attributeFilters,
    availability,
    brandId,
    categoryId,
    categoryIds,
    collection,
    merchandisingLabel,
    search,
  });
  return <CatalogFilters
    attributeFilters={attributeFilters}
    availability={availability}
    brandId={brandId}
    categoryId={categoryId}
    categorySet={categorySet}
    collection={collection}
    explicitAll={explicitAll}
    locale={locale}
    merchandisingLabel={merchandisingLabel}
    facets={result.success ? result.data : []}
    search={search}
    sort={sort}
  />;
}

function CatalogFacetFallback({ copy }: { copy: CatalogCopy }) {
  return <aside aria-busy="true" aria-label={copy.filtersLoading} className="min-h-80 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
    <div className="h-10 animate-pulse rounded bg-zinc-100" />
    <div className="mt-5 space-y-4">{Array.from({ length: 5 }, (_, index) => <div className="h-9 animate-pulse rounded bg-zinc-100" key={index} />)}</div>
  </aside>;
}

function withoutAttributeValue(filters: Record<string, string[]>, key: string, value: string): Record<string, string[]> { const next = Object.fromEntries(Object.entries(filters).map(([entryKey, values]) => [entryKey, values.filter((item) => entryKey !== key || item !== value)])); return Object.fromEntries(Object.entries(next).filter(([, values]) => values.length)); }
function FilterChip({ href, label }: { href: string; label: string }) { return <Link className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-zinc-700 hover:border-emerald-500" href={href} prefetch={false}>{label} ×</Link>; }
function createCommercialViewMap(views: ProductCommercialViewDto[]): Record<string, ProductCommercialViewDto> { return Object.fromEntries(views.map((view) => [view.productId, view])); }
function merchandisingLabelName(label: MerchandisingLabelCode, copy: CatalogCopy): string { return label === "TOP" ? copy.popular : label === "NEW" ? copy.newItems : copy.hotPrice; }
type CatalogCopy = ReturnType<typeof getCatalogCopy>;
