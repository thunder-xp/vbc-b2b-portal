import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { listCommercialOpportunitiesAction } from "@/src/modules/commercial-opportunities/actions";
import { OpportunityCard } from "@/src/modules/commercial-opportunities/components";
import { opportunityPresentationVariant } from "@/src/modules/commercial-opportunities/presentation";
import type { CommercialOpportunityFilter } from "@/src/modules/commercial-opportunities/types";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { NumberedPagination, PageHeader, actionClassName } from "@/src/modules/platform-ui";
import { secondaryCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import type { PartnerLocale } from "@/src/modules/partner-locale";

type SearchParams = Promise<{
  filter?: string | string[];
  page?: string | string[];
}>;
function filters(
  locale: PartnerLocale,
): Array<{ value: CommercialOpportunityFilter; label: string }> {
  const copy = secondaryCopy(locale);
  return [
    { value: "all", label: copy.filterAll },
    { value: "available", label: copy.filterAvailable },
    { value: "arrivals", label: copy.filterArrivals },
    { value: "price", label: copy.filterPrice },
    { value: "templates", label: copy.filterTemplates },
    { value: "offers", label: copy.filterOffers },
  ];
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = secondaryCopy(locale);
  const availableFilters = filters(locale);
  const filter = normalizeFilter(single(params.filter), availableFilters);
  const page = Math.max(1, Number(single(params.page)) || 1);
  const [result, contextResult] = await Promise.all([
    listCommercialOpportunitiesAction({ filter, page }),
    getPartnerWorkspaceContextAction(),
  ]);
  if (!result.success && result.errorCode === "AUTH_REQUIRED")
    redirect("/auth/sign-in");
  if (!result.success)
    return (
      <section className="border border-rose-200 bg-rose-50 p-6">
        <h1 className="font-semibold text-rose-900">
          {copy.opportunitiesUnavailable}
        </h1>
        <p className="mt-1 text-sm text-rose-800">
          {copy.opportunitiesUnavailableHint}
        </p>
      </section>
    );
  const indexedOpportunities = result.data.items.map((opportunity, businessOrder) => ({ opportunity, businessOrder }));
  const wideOpportunities = indexedOpportunities.filter(({ opportunity }) => opportunityPresentationVariant(opportunity) === "wide");
  const compactOpportunities = indexedOpportunities.filter(({ opportunity }) => opportunityPresentationVariant(opportunity) === "compact");
  const companyId = contextResult.success ? contextResult.data.companyId : null;
  const userId = contextResult.success ? contextResult.data.userId : null;

  return (
    <div className="min-w-0 space-y-3">
      <BehaviorViewEvent
        dedupeKey={`opportunities:${filter}:${page}`}
        eventName="opportunities_opened"
        resultCount={result.data.totalCount}
        route="/cabinet/opportunities"
        sourceSurface="opportunity_center"
      />
      <PageHeader compact title={copy.opportunitiesTitle} />
      <nav
        aria-label={copy.opportunitiesFilters}
        className="flex max-w-full gap-2 overflow-x-auto pb-1"
      >
        {availableFilters.map((item) => (
          <Link
            aria-current={filter === item.value ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center rounded-md border px-3 text-sm font-semibold ${filter === item.value ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-700"}`}
            href={filterHref(item.value)}
            key={item.value}
            prefetch={false}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {result.data.items.length ? (
        <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)] xl:items-start" data-opportunity-grid>
          <div className="contents xl:flex xl:flex-col xl:gap-3" data-opportunity-lane="wide">
          {wideOpportunities.map(({ opportunity, businessOrder }) => (
            <div className="order-[var(--business-order)] xl:order-none" key={opportunity.id} style={{ "--business-order": businessOrder } as CSSProperties}>
            <OpportunityCard
              canAddToOrder={
                contextResult.success &&
                contextResult.data.capabilities.productCard.canAddToOrder
              }
              canAddToSpecification={
                contextResult.success &&
                contextResult.data.capabilities.productCard
                  .canAddToSpecification
              }
              canManagePurchasingLists={
                contextResult.success &&
                contextResult.data.capabilities.productCard
                  .canManagePurchasingLists
              }
              companyId={companyId}
              locale={locale}
              opportunity={opportunity}
              userId={userId}
            />
            </div>
          ))}
          </div>
          <div className="contents xl:flex xl:flex-col xl:gap-3" data-opportunity-lane="compact">
          {compactOpportunities.map(({ opportunity, businessOrder }) => (
            <div className="order-[var(--business-order)] xl:order-none" key={opportunity.id} style={{ "--business-order": businessOrder } as CSSProperties}>
              <OpportunityCard
                canAddToOrder={contextResult.success && contextResult.data.capabilities.productCard.canAddToOrder}
                canAddToSpecification={contextResult.success && contextResult.data.capabilities.productCard.canAddToSpecification}
                canManagePurchasingLists={contextResult.success && contextResult.data.capabilities.productCard.canManagePurchasingLists}
                companyId={companyId}
                locale={locale}
                opportunity={opportunity}
                userId={userId}
              />
            </div>
          ))}
          </div>
        </div>
      ) : (
        <section className="py-4" data-compact-empty>
          <h2 className="font-semibold text-zinc-950">
            {copy.opportunitiesEmpty}
          </h2>
          <Link
            className={`${actionClassName.primary} mt-3`}
            href="/cabinet/catalog"
          >
            {copy.openCatalog}
          </Link>
        </section>
      )}
      <NumberedPagination
        ariaLabel={copy.opportunitiesPages}
        currentPage={result.data.page}
        hrefForPage={(targetPage) => pageHref(filter, targetPage)}
        locale={locale}
        totalPages={result.data.totalPages}
      />
    </div>
  );
}

function normalizeFilter(
  value: string,
  availableFilters: Array<{ value: CommercialOpportunityFilter }>,
): CommercialOpportunityFilter {
  return availableFilters.some((item) => item.value === value)
    ? (value as CommercialOpportunityFilter)
    : "all";
}
function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
function filterHref(filter: CommercialOpportunityFilter): string {
  return filter === "all"
    ? "/cabinet/opportunities"
    : `/cabinet/opportunities?filter=${filter}`;
}
function pageHref(filter: CommercialOpportunityFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  return `/cabinet/opportunities?${params}`;
}
