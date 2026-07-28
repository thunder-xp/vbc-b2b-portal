import { LayoutGrid } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import {
  listCatalogMerchandisingSectionsAction,
} from "@/src/modules/catalog/actions";
import { listCatalogCategoriesAction } from "@/src/modules/catalog/actions/list-categories.action";
import { listCatalogProductsAction } from "@/src/modules/catalog/actions/list-products.action";
import { CatalogBreadcrumb } from "@/src/modules/catalog/components/CatalogBreadcrumb";
import { CatalogSearch } from "@/src/modules/catalog/components/CatalogSearch";
import { CategoryMegaMenu } from "@/src/modules/catalog/components/CategoryMegaMenu";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import {
  CATALOG_VIEW_COOKIE,
  parseCatalogRouteState,
  parseCatalogViewMode,
} from "@/src/modules/catalog/services";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";

import { CatalogResults } from "./CatalogResults";
import { CuratedCatalogResults } from "./CuratedCatalogResults";

type CatalogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 12;

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const routeState = parseCatalogRouteState(params);
  const initialViewMode = parseCatalogViewMode(cookieStore.get(CATALOG_VIEW_COOKIE)?.value);
  const categoriesResult = await listCatalogCategoriesAction();

  if (!categoriesResult.success) {
    return <EmptyCatalog message={categoriesResult.message} title="Каталог временно недоступен" />;
  }

  return <div className="space-y-6">
    <div className="flex gap-3">
      <CategoryMegaMenu categories={categoriesResult.data} merchandisingLabel={routeState.merchandisingLabel} sort={routeState.sort} />
      <CatalogSearch categoryId={routeState.categoryId} initialSearch={routeState.search} merchandisingLabel={routeState.merchandisingLabel} sort={routeState.sort} />
      {routeState.mode === "curated" ? <Link className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:border-emerald-600 hover:text-emerald-800" href="/cabinet/catalog?view=all" prefetch={false}><LayoutGrid aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Весь каталог</span></Link> : null}
    </div>
    {routeState.mode === "discovery" ? <CatalogBreadcrumb categories={categoriesResult.data} selectedId={routeState.categoryId} /> : null}
    <Suspense fallback={<CatalogResultsFallback curated={routeState.mode === "curated"} />}>
      {routeState.mode === "curated"
        ? <CuratedCatalogResults merchandisingPromise={listCatalogMerchandisingSectionsAction()} workspacePromise={getPartnerWorkspaceContextAction()} />
        : <CatalogResults
            attributeFilters={routeState.attributeFilters}
            availability={routeState.availability}
            brandId={routeState.brandId}
            categories={categoriesResult.data}
            categoryId={routeState.categoryId}
            explicitAll={routeState.explicitAll}
            initialViewMode={initialViewMode}
            merchandisingLabel={routeState.merchandisingLabel}
            page={routeState.page}
            productsPromise={listCatalogProductsAction({
              attributeFilters: routeState.attributeFilters,
              availability: routeState.availability,
              brandId: routeState.brandId,
              categoryId: routeState.categoryId,
              merchandisingLabel: routeState.merchandisingLabel,
              page: routeState.page,
              pageSize: PAGE_SIZE,
              search: routeState.search,
              sort: routeState.sort,
            })}
            search={routeState.search}
            sort={routeState.sort}
            workspacePromise={getPartnerWorkspaceContextAction()}
          />}
    </Suspense>
  </div>;
}

function CatalogResultsFallback({ curated }: { curated: boolean }) {
  return <div aria-busy="true" aria-label="Каталог загружается" className="space-y-6">
    <div className="h-16 animate-pulse border-b border-zinc-200 bg-zinc-100" />
    {curated
      ? <div className="grid min-h-[300px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div className="h-[300px] animate-pulse rounded-md bg-zinc-100" key={index} />)}</div>
      : <div className="grid gap-6 lg:grid-cols-[260px_1fr]"><div className="h-80 animate-pulse rounded-lg bg-zinc-100" /><div className="grid min-h-[620px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <div className="h-[300px] animate-pulse rounded-md bg-zinc-100" key={index} />)}</div></div>}
  </div>;
}
