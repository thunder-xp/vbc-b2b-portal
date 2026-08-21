import Link from "next/link";
import { redirect } from "next/navigation";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { listCommercialOpportunitiesAction } from "@/src/modules/commercial-opportunities/actions";
import { OpportunityCard } from "@/src/modules/commercial-opportunities/components";
import type { CommercialOpportunityFilter } from "@/src/modules/commercial-opportunities/types";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { NumberedPagination } from "@/src/modules/platform-ui";
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

  return (
    <div className="space-y-6">
      <BehaviorViewEvent
        dedupeKey={`opportunities:${filter}:${page}`}
        eventName="opportunities_opened"
        resultCount={result.data.totalCount}
        route="/cabinet/opportunities"
        sourceSurface="opportunity_center"
      />
      <header className="border-b border-zinc-200 pb-5">
        <p className="text-xs font-semibold uppercase text-emerald-700">
          {copy.opportunitiesEyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950 sm:text-3xl">
          {copy.opportunitiesTitle}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          {copy.opportunitiesDescription}
        </p>
      </header>
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
        <div className="grid gap-4 xl:grid-cols-2">
          {result.data.items.map((opportunity) => (
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
              key={opportunity.id}
              locale={locale}
              opportunity={opportunity}
            />
          ))}
        </div>
      ) : (
        <section className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <h2 className="font-semibold text-zinc-950">
            {copy.opportunitiesEmpty}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {copy.opportunitiesEmptyHint}
          </p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"
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
