import { Suspense } from "react";

import { listCatalogCategoriesAction } from "@/src/modules/catalog/actions/list-categories.action";
import { listCatalogProductsAction } from "@/src/modules/catalog/actions/list-products.action";
import { CatalogBreadcrumb } from "@/src/modules/catalog/components/CatalogBreadcrumb";
import { CatalogSearch } from "@/src/modules/catalog/components/CatalogSearch";
import { CategoryMegaMenu } from "@/src/modules/catalog/components/CategoryMegaMenu";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import type { CatalogAvailability } from "@/src/modules/catalog/components/CatalogFilters";
import {
  parseCatalogAttributeFilters,
  parseCatalogSort,
} from "@/src/modules/catalog/services";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";

import { CatalogResults } from "./CatalogResults";

type CatalogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 12;

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const categoryId = getSingleParam(params?.category);
  const search = getSingleParam(params?.search);
  const availability = parseAvailability(getSingleParam(params?.availability));
  const sort = parseCatalogSort(getSingleParam(params?.sort));
  const page = parsePage(getSingleParam(params?.page));
  const attributeFilters = parseCatalogAttributeFilters(params);

  const categoriesPromise = listCatalogCategoriesAction();
  const productsPromise = listCatalogProductsAction({
    categoryId,
    search,
    availability,
    page,
    pageSize: PAGE_SIZE,
    sort,
    attributeFilters,
  });
  const workspacePromise = getPartnerWorkspaceContextAction();
  const categoriesResult = await categoriesPromise;

  if (!categoriesResult.success) {
    return <EmptyCatalog message={categoriesResult.message} title="Catalog unavailable" />;
  }

  return <div className="space-y-6">
    <div className="flex gap-3">
      <CategoryMegaMenu categories={categoriesResult.data} sort={sort} />
      <CatalogSearch categoryId={categoryId} initialSearch={search} sort={sort} />
    </div>
    <CatalogBreadcrumb categories={categoriesResult.data} selectedId={categoryId} />
    <Suspense fallback={<CatalogResultsFallback />}>
      <CatalogResults
        attributeFilters={attributeFilters}
        availability={availability}
        categories={categoriesResult.data}
        categoryId={categoryId}
        page={page}
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
