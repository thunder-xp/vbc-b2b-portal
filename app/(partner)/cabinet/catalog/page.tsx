import { Suspense } from "react";
import { cookies } from "next/headers";

import { listCatalogCategoriesAction } from "@/src/modules/catalog/actions/list-categories.action";
import { listCatalogProductsAction } from "@/src/modules/catalog/actions/list-products.action";
import { listCatalogMerchandisingSectionsAction } from "@/src/modules/catalog/actions";
import { CatalogBreadcrumb } from "@/src/modules/catalog/components/CatalogBreadcrumb";
import { CatalogSearch } from "@/src/modules/catalog/components/CatalogSearch";
import { CategoryMegaMenu } from "@/src/modules/catalog/components/CategoryMegaMenu";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import type { CatalogAvailability } from "@/src/modules/catalog/components/CatalogFilters";
import type { MerchandisingLabelCode } from "@/src/modules/merchandising/types";
import {
  CATALOG_VIEW_COOKIE,
  parseCatalogAttributeFilters,
  parseCatalogSort,
  parseCatalogViewMode,
} from "@/src/modules/catalog/services";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";

import { CatalogResults } from "./CatalogResults";

type CatalogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 12;

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const categoryId = getSingleParam(params?.category);
  const search = getSingleParam(params?.search);
  const availability = parseAvailability(getSingleParam(params?.availability));
  const sort = parseCatalogSort(getSingleParam(params?.sort));
  const merchandisingLabel = parseMerchandisingLabel(getSingleParam(params?.label));
  const page = parsePage(getSingleParam(params?.page));
  const attributeFilters = parseCatalogAttributeFilters(params);
  const initialViewMode = parseCatalogViewMode(cookieStore.get(CATALOG_VIEW_COOKIE)?.value);

  const categoriesPromise = listCatalogCategoriesAction();
  const productsPromise = listCatalogProductsAction({
    categoryId,
    search,
    availability,
    merchandisingLabel,
    page,
    pageSize: PAGE_SIZE,
    sort,
    attributeFilters,
  });
  const workspacePromise = getPartnerWorkspaceContextAction();
  const merchandisingPromise = isCatalogLanding({
    attributeFilters,
    availability,
    categoryId,
    merchandisingLabel,
    page,
    search,
  })
    ? listCatalogMerchandisingSectionsAction()
    : undefined;
  const categoriesResult = await categoriesPromise;

  if (!categoriesResult.success) {
    return <EmptyCatalog message={categoriesResult.message} title="Catalog unavailable" />;
  }

  return <div className="space-y-6">
    <div className="flex gap-3">
      <CategoryMegaMenu categories={categoriesResult.data} merchandisingLabel={merchandisingLabel} sort={sort} />
      <CatalogSearch categoryId={categoryId} initialSearch={search} merchandisingLabel={merchandisingLabel} sort={sort} />
    </div>
    <CatalogBreadcrumb categories={categoriesResult.data} selectedId={categoryId} />
    <Suspense fallback={<CatalogResultsFallback />}>
      <CatalogResults
        attributeFilters={attributeFilters}
        availability={availability}
        categories={categoriesResult.data}
        categoryId={categoryId}
        page={page}
        initialViewMode={initialViewMode}
        merchandisingLabel={merchandisingLabel}
        merchandisingPromise={merchandisingPromise}
        productsPromise={productsPromise}
        search={search}
        sort={sort}
        workspacePromise={workspacePromise}
      />
    </Suspense>
  </div>;
}

function CatalogResultsFallback() {
  return <div aria-busy="true" aria-label="Каталог загружается" className="space-y-6">
    <div className="h-16 animate-pulse border-b border-zinc-200 bg-zinc-100" />
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <div className="h-80 animate-pulse rounded-lg bg-zinc-100" />
      <div className="grid min-h-[620px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <div className="h-[300px] animate-pulse rounded-md bg-zinc-100" key={index} />)}</div>
    </div>
  </div>;
}

function getSingleParam(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value || undefined; }
function parsePage(value: string | undefined): number { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1; }
function parseAvailability(value: string | undefined): CatalogAvailability { return value === "in_stock" || value === "expected" ? value : "all"; }
function parseMerchandisingLabel(value: string | undefined): MerchandisingLabelCode | undefined { return value === "NEW" || value === "TOP" || value === "HOT" ? value : undefined; }
function isCatalogLanding(input: { attributeFilters: Record<string, string[]>; availability: CatalogAvailability; categoryId?: string; merchandisingLabel?: MerchandisingLabelCode; page: number; search?: string }): boolean { return input.page === 1 && input.availability === "all" && !input.categoryId && !input.merchandisingLabel && !input.search && Object.keys(input.attributeFilters).length === 0; }
