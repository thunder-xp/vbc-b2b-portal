import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { CatalogPresentation } from "@/src/modules/catalog/components/CatalogPresentation";
import {
  CATALOG_VIEW_COOKIE,
  parseCatalogViewMode,
  type CatalogProductCardDto,
} from "@/src/modules/catalog/services";
import { listPreviouslyPurchasedProductsAction } from "@/src/modules/orders/actions/previously-purchased-products.action";
import { RepeatPurchaseCategoryFilters } from "@/src/modules/orders/components/RepeatPurchaseCategoryFilters";
import { repeatPurchaseHref } from "@/src/modules/orders/components/repeat-purchase-query";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { repeatPurchaseCopy } from "@/src/modules/partner-locale";
import { NumberedPagination, PageHeader } from "@/src/modules/platform-ui";
import type { ProductCommercialViewDto } from "@/src/modules/pricing-inventory";

const PAGE_SIZE = 20;

type SearchParams = Promise<{
  category?: string | string[];
  page?: string | string[];
  search?: string | string[];
}>;

export default async function RepeatPurchasePage({ searchParams }: { searchParams: SearchParams }) {
  const [params, locale, cookieStore, workspaceResult] = await Promise.all([
    searchParams,
    getPartnerLocale(),
    cookies(),
    getPartnerWorkspaceContextAction(),
  ]);
  if (!workspaceResult.success && workspaceResult.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");

  const copy = repeatPurchaseCopy(locale);
  const page = positivePage(single(params.page));
  const search = single(params.search).trim().slice(0, 100);
  const categoryIds = uuidList(params.category);
  const result = await listPreviouslyPurchasedProductsAction({
    categoryIds,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search,
  });
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
  if (!result.success || !workspaceResult.success) {
    return <section className="border border-rose-200 bg-rose-50 p-6"><h1 className="font-semibold text-rose-900">{copy.unavailableTitle}</h1><p className="mt-1 text-sm text-rose-800">{copy.unavailableMessage}</p></section>;
  }

  const data = result.data;
  const totalPages = Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE));
  const products: CatalogProductCardDto[] = data.items.map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    slug: item.slug,
    shortDescription: null,
    imageUrl: item.imageUrl,
    brand: null,
    category: item.categoryId && item.categoryName && item.categorySlug ? {
      id: item.categoryId,
      parentId: null,
      name: item.categoryName,
      slug: item.categorySlug,
      description: null,
    } : null,
    keyCharacteristics: [],
    datasheet: null,
    merchandisingLabels: [],
  }));
  const commercialViews = Object.fromEntries(data.items.map((item) => [item.id, item.commercialView])) satisfies Record<string, ProductCommercialViewDto>;
  const currentHref = repeatPurchaseHref({ categoryIds, page, search });

  return <div className="min-w-0 space-y-4" data-repeat-purchase-page>
    <BehaviorViewEvent dedupeKey={`repeat-purchase:${categoryIds.join(",") || "all"}:${search}:${page}`} eventName="catalog_viewed" resultCount={data.totalCount} route="/cabinet/repeat-purchase" searchQuery={search || undefined} sourceSurface="repeat_purchase_history" />
    <PageHeader compact title={copy.title} />
    <div className="grid gap-3 border-y border-zinc-200 bg-white py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <form action="/cabinet/repeat-purchase" className="flex min-w-0 gap-2" method="get" role="search">
        {categoryIds.map((categoryId) => <input key={categoryId} name="category" type="hidden" value={categoryId} />)}
        <label className="min-w-0 flex-1"><span className="sr-only">{copy.searchLabel}</span><input className="h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200" defaultValue={search} name="search" placeholder={copy.searchPlaceholder} type="search" /></label>
        <button className="inline-flex h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" type="submit">{copy.search}</button>
        {search ? <Link className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700" href={repeatPurchaseHref({ categoryIds, page: 1, search: "" })} prefetch={false}>{copy.clearSearch}</Link> : null}
      </form>
      <p className="text-sm font-medium text-zinc-600"><strong className="text-zinc-950">{data.totalCount}</strong> {copy.products}</p>
    </div>
    <CatalogPresentation
      capabilities={workspaceResult.data.capabilities.productCard}
      catalogState={{ attributeFilters: {}, availability: "all", categoryId: undefined, explicitAll: true, page, search: search || undefined, sort: "default" }}
      commercialViews={commercialViews}
      companyId={workspaceResult.data.companyId}
      detailReturnHref={currentHref}
      emptyState={<section className="border border-zinc-200 bg-white p-6"><h2 className="font-semibold text-zinc-950">{copy.emptyTitle}</h2><p className="mt-1 text-sm text-zinc-600">{copy.emptyMessage}</p></section>}
      initialMode={parseCatalogViewMode(cookieStore.get(CATALOG_VIEW_COOKIE)?.value)}
      products={products}
      quickLinks={<RepeatPurchaseCategoryFilters allCount={data.allCount} allLabel={copy.allCategories} categories={data.categories} search={search} selectedCategoryIds={categoryIds} />}
      userId={workspaceResult.data.userId}
    />
    <NumberedPagination ariaLabel={copy.pages} currentPage={Math.min(page, totalPages)} hrefForPage={(target) => repeatPurchaseHref({ categoryIds, page: target, search })} locale={locale} totalPages={totalPages} />
  </div>;
}

function positivePage(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function uuidList(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => item.trim().toLowerCase()).filter((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item)))].slice(0, 50);
}
