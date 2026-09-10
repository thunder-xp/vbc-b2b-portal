import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { CatalogPresentation } from "@/src/modules/catalog/components/CatalogPresentation";
import {
  CATALOG_VIEW_COOKIE,
  parseCategoryIds,
  parseCatalogViewMode,
  resolveCatalogQuickLinks,
  type CatalogProductCardDto,
} from "@/src/modules/catalog/services";
import { PartnerTopCategoryFilterBar } from "@/src/modules/catalog/components/PartnerTopCategoryFilterBar";
import { listPreviouslyPurchasedProductsAction } from "@/src/modules/orders/actions/previously-purchased-products.action";
import { repeatPurchaseHref } from "@/src/modules/orders/components/repeat-purchase-query";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { repeatPurchaseCopy } from "@/src/modules/partner-locale";
import { NumberedPagination } from "@/src/modules/platform-ui";
import type { ProductCommercialViewDto } from "@/src/modules/pricing-inventory";
import { canonicalizeLegacyRollingPeriodParams, parseRollingPeriodState, resolveRollingPeriod, RollingPeriodSelector } from "@/src/modules/commerce-period";

const PAGE_SIZE = 20;

type SearchParams = Promise<{
  categories?: string | string[];
  page?: string | string[];
  period?: string | string[];
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
  const canonicalHref = canonicalizeLegacyRollingPeriodParams("/cabinet/repeat-purchase", params);
  if (canonicalHref) redirect(canonicalHref);

  const copy = repeatPurchaseCopy(locale);
  const page = positivePage(single(params.page));
  const periodState = parseRollingPeriodState(single(params.period));
  const period = resolveRollingPeriod(periodState);
  const search = single(params.search).trim().slice(0, 100);
  const categoryIds = parseCategoryIds(params.categories);
  const result = await listPreviouslyPurchasedProductsAction({
    categoryIds,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    period,
    search,
  });
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
  if (!result.success || !workspaceResult.success) {
    return <section className="border border-rose-200 bg-rose-50 p-6"><h1 className="font-semibold text-rose-900">{copy.unavailableTitle}</h1><p className="mt-1 text-sm text-rose-800">{copy.unavailableMessage}</p></section>;
  }

  const data = result.data;
  const topCategories = resolveCatalogQuickLinks(data.categories, locale)
    .filter((category) => (category.productCount ?? 0) > 0);
  const allowedCategoryIds = new Set(topCategories.flatMap((category) => category.categoryIds));
  const selectedCategoryIds = categoryIds.filter((id) => allowedCategoryIds.has(id));
  if (selectedCategoryIds.length !== categoryIds.length) {
    redirect(repeatPurchaseHref({ categoryIds: selectedCategoryIds, page, period, search }));
  }
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
  const currentHref = repeatPurchaseHref({ categoryIds: selectedCategoryIds, page, period, search });

  return <div className="min-w-0 space-y-4" data-repeat-purchase-page>
    <BehaviorViewEvent dedupeKey={`repeat-purchase:${period}:${selectedCategoryIds.join(",") || "all"}:${search}:${page}`} eventName="catalog_viewed" resultCount={data.totalCount} route="/cabinet/repeat-purchase" searchQuery={search || undefined} sourceSurface="repeat_purchase_history" />
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4"><h1 className="text-2xl font-semibold text-zinc-950">{copy.title}</h1><RollingPeriodSelector activePeriod={periodState} hrefForPeriod={(target) => repeatPurchaseHref({ categoryIds: selectedCategoryIds, page: 1, period: target, search })} locale={locale} /></div>
      <p className="text-sm font-medium text-zinc-600" data-repeat-purchase-total><strong className="text-zinc-950">{data.totalCount}</strong> {copy.products}</p>
    </header>
    <div className="border-y border-zinc-200 bg-white py-3">
      <form action="/cabinet/repeat-purchase" className="flex min-w-0 flex-wrap gap-2" method="get" role="search">
        {selectedCategoryIds.length ? <input name="categories" type="hidden" value={selectedCategoryIds.join(",")} /> : null}
        {periodState ? <input name="period" type="hidden" value={periodState} /> : null}
        <label className="min-w-[12rem] flex-[1_1_24rem]"><span className="sr-only">{copy.searchLabel}</span><input className="h-11 w-full rounded border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200" defaultValue={search} name="search" placeholder={copy.searchPlaceholder} type="search" /></label>
        <button className="inline-flex h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" type="submit">{copy.search}</button>
        <Link className="inline-flex h-11 items-center justify-center rounded-none border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href="/cabinet/catalog" prefetch={false}>{copy.wholeCatalog}</Link>
        {search ? <Link className="inline-flex h-11 items-center justify-center rounded border border-zinc-300 px-3 text-sm font-semibold text-zinc-700" href={repeatPurchaseHref({ categoryIds: selectedCategoryIds, page: 1, period, search: "" })} prefetch={false}>{copy.clearSearch}</Link> : null}
      </form>
    </div>
    <CatalogPresentation
      capabilities={workspaceResult.data.capabilities.productCard}
      catalogState={{ attributeFilters: {}, availability: "all", categoryId: undefined, categoryIds: selectedCategoryIds, explicitAll: true, page, search: search || undefined, sort: "default" }}
      commercialViews={commercialViews}
      companyId={workspaceResult.data.companyId}
      detailReturnHref={currentHref}
      emptyState={<section className="border border-zinc-200 bg-white p-6"><h2 className="font-semibold text-zinc-950">{copy.emptyTitle}</h2><p className="mt-1 text-sm text-zinc-600">{copy.emptyMessage}</p></section>}
      initialMode={parseCatalogViewMode(cookieStore.get(CATALOG_VIEW_COOKIE)?.value)}
      products={products}
      quickLinks={<PartnerTopCategoryFilterBar allCount={data.allCount} allLabel={copy.allCategories} categories={topCategories} currentHref={currentHref} selectedCategoryIds={selectedCategoryIds} />}
      userId={workspaceResult.data.userId}
    />
    <NumberedPagination ariaLabel={copy.pages} currentPage={Math.min(page, totalPages)} hrefForPage={(target) => repeatPurchaseHref({ categoryIds: selectedCategoryIds, page: target, period, search })} locale={locale} totalPages={totalPages} />
  </div>;
}

function positivePage(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
