import { Calculator, FilePlus2, Search } from "lucide-react";
import Link from "next/link";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { listEstimatesAction } from "@/src/modules/estimates/actions";
import { EstimateStatusBadge } from "@/src/modules/estimates/components/EstimateStatusBadge";
import { EstimateListActions } from "@/src/modules/estimates/components/EstimateListActions";
import type {
  EstimateLifecycleStatus,
  EstimateStatus,
} from "@/src/modules/estimates/types";
import { NumberedPagination } from "@/src/modules/platform-ui";
import {
  estimateStatusLabel,
  formatPartnerDate,
  getEstimatesCopy,
} from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

type SearchParams = {
  search?: string;
  status?: string;
  lifecycleStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
};
export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [query, locale] = await Promise.all([searchParams, getPartnerLocale()]);
  const copy = getEstimatesCopy(locale);
  const quickFilters = [
    { label: copy.all, href: "/cabinet/estimates" },
    { label: copy.drafts, href: "/cabinet/estimates?lifecycleStatus=draft" },
    { label: copy.readyForProposal, href: "/cabinet/estimates?status=ready" },
    { label: copy.sentPlural, href: "/cabinet/estimates?lifecycleStatus=sent" },
    {
      label: copy.acceptedPlural,
      href: "/cabinet/estimates?lifecycleStatus=accepted",
    },
    {
      label: copy.rejectedPlural,
      href: "/cabinet/estimates?lifecycleStatus=rejected",
    },
    { label: copy.archive, href: "/cabinet/estimates?status=archived" },
  ];
  const result = await listEstimatesAction({
    search: query.search,
    status: query.status as EstimateStatus | undefined,
    lifecycleStatus: query.lifecycleStatus as
      EstimateLifecycleStatus | undefined,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    page: Number(query.page),
  });

  return (
    <div className="space-y-5">
      <BehaviorViewEvent
        dedupeKey={`estimates:${query.status ?? "all"}:${query.lifecycleStatus ?? "all"}:${query.page ?? "1"}`}
        eventName="estimates_viewed"
        resultCount={result.success ? result.data.records.length : undefined}
        route="/cabinet/estimates"
        sourceSurface="estimate_list"
      />
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">{copy.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{copy.subtitle}</p>
        </div>
        <Link
          className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
          href="/cabinet/estimates/new"
          prefetch={false}
        >
          <FilePlus2 className="size-4" />
          {copy.create}
        </Link>
      </header>

      <nav
        aria-label={copy.quickFilters}
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {quickFilters.map((filter) => (
          <Link
            className="min-h-11 shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 hover:border-emerald-600 hover:text-emerald-700"
            href={filter.href}
            key={filter.href}
            prefetch={false}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      <form className="grid gap-3 border-b border-zinc-200 pb-5 lg:grid-cols-[minmax(14rem,1fr)_12rem_10rem_10rem_auto]">
        <label className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-3 size-4 text-zinc-400"
          />
          <span className="sr-only">{copy.search}</span>
          <input
            className="h-10 w-full rounded-md border border-zinc-300 pl-9 pr-3 text-sm"
            defaultValue={query.search}
            name="search"
            placeholder={copy.searchPlaceholder}
          />
        </label>
        <label>
          <span className="sr-only">{copy.lifecycle}</span>
          <select
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
            defaultValue={query.lifecycleStatus ?? ""}
            name="lifecycleStatus"
          >
            <option value="">{copy.allStages}</option>
            {(
              [
                "draft",
                "sent",
                "accepted",
                "rejected",
                "expired",
                "converted_to_order",
              ] as const
            ).map((value) => (
              <option key={value} value={value}>
                {estimateStatusLabel(value, copy)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">{copy.dateFrom}</span>
          <input
            className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
            defaultValue={query.dateFrom}
            name="dateFrom"
            type="date"
          />
        </label>
        <label>
          <span className="sr-only">{copy.dateTo}</span>
          <input
            className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
            defaultValue={query.dateTo}
            name="dateTo"
            type="date"
          />
        </label>
        <button
          className="h-10 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold"
          type="submit"
        >
          {copy.apply}
        </button>
      </form>

      {!result.success ? (
        <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
          {result.message}
        </p>
      ) : result.data.records.length ? (
        <>
          <div className="grid min-w-0 gap-3 lg:hidden">
            {result.data.records.map((estimate) => (
              <article
                className="min-w-0 max-w-full border-y border-zinc-200 bg-white px-4 py-4"
                key={estimate.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      className="font-semibold text-zinc-950"
                      href={`/cabinet/estimates/${estimate.id}`}
                      prefetch={false}
                    >
                      {estimate.estimateNumber}
                    </Link>
                    <p className="truncate text-sm text-zinc-600">
                      {estimate.name}
                    </p>
                  </div>
                  <EstimateStatusBadge
                    locale={locale}
                    status={estimate.archived ? "archived" : estimate.status}
                  />
                </div>
                <p className="mt-3 text-sm text-zinc-600">
                  {estimate.customerProject}
                </p>
                <div className="mt-3 flex min-w-0 items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{estimate.total}</p>
                    <p className="break-words text-xs text-zinc-500">
                      {estimate.itemCount} {copy.positions} ·{" "}
                      {copy.updated.toLocaleLowerCase()}{" "}
                      {formatPartnerDate(estimate.updatedAt, locale)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {proposalState(
                        estimate.latestPdfDocumentId,
                        estimate.versionCount > 0,
                        copy,
                      )}
                    </p>
                  </div>
                  <EstimateListActions
                    archived={estimate.archived}
                    canDeleteArchived={estimate.canDeleteArchived}
                    estimateId={estimate.id}
                    latestPdfDocumentId={estimate.latestPdfDocumentId}
                    revision={estimate.revision}
                  />
                </div>
              </article>
            ))}
          </div>
          <div className="hidden max-w-full overflow-x-auto border-y border-zinc-200 bg-white lg:block">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">{copy.estimate}</th>
                  <th className="px-4 py-3">{copy.customerProject}</th>
                  <th className="px-4 py-3">{copy.status}</th>
                  <th className="px-4 py-3 text-right">{copy.total}</th>
                  <th className="px-4 py-3">{copy.dates}</th>
                  <th className="px-4 py-3">{copy.proposal}</th>
                  <th className="px-4 py-3">{copy.author}</th>
                  <th className="px-4 py-3">{copy.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {result.data.records.map((estimate) => (
                  <tr className="hover:bg-zinc-50" key={estimate.id}>
                    <td className="px-4 py-4">
                      <Link
                        className="font-semibold text-zinc-950 hover:text-emerald-700"
                        href={`/cabinet/estimates/${estimate.id}`}
                        prefetch={false}
                      >
                        {estimate.estimateNumber}
                      </Link>
                      <p className="mt-1 max-w-xs truncate text-xs text-zinc-500">
                        {estimate.name}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-zinc-600">
                      {estimate.customerProject}
                      <p className="mt-1 text-xs text-zinc-400">
                        {estimate.itemCount} {copy.positions}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <EstimateStatusBadge
                        locale={locale}
                        status={
                          estimate.archived ? "archived" : estimate.status
                        }
                      />
                    </td>
                    <td className="px-4 py-4 text-right font-semibold">
                      {estimate.total}
                    </td>
                    <td className="px-4 py-4 text-zinc-600">
                      <span className="block">
                        {copy.created}{" "}
                        {formatPartnerDate(estimate.createdAt, locale)}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {copy.updated}{" "}
                        {formatPartnerDate(estimate.updatedAt, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-xs text-zinc-600">
                        {proposalState(
                          estimate.latestPdfDocumentId,
                          estimate.versionCount > 0,
                          copy,
                        )}
                      </p>
                      {estimate.hasAcceptedVersion && (
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          {copy.acceptedByCustomer}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-zinc-600">
                      {estimate.createdByName}
                    </td>
                    <td className="px-4 py-4">
                      <EstimateListActions
                        archived={estimate.archived}
                        canDeleteArchived={estimate.canDeleteArchived}
                        estimateId={estimate.id}
                        latestPdfDocumentId={estimate.latestPdfDocumentId}
                        revision={estimate.revision}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            ariaLabel={copy.pages}
            current={result.data.page}
            locale={locale}
            query={query}
            total={result.data.totalPages}
          />
        </>
      ) : (
        <section className="border-y border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <Calculator className="mx-auto size-8 text-emerald-700" />
          <h2 className="mt-4 font-semibold">{copy.emptyTitle}</h2>
          <p className="mt-1 text-sm text-zinc-500">{copy.emptyHint}</p>
          <Link
            className="mt-5 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
            href="/cabinet/estimates/new"
            prefetch={false}
          >
            {copy.create}
          </Link>
        </section>
      )}
    </div>
  );
}

function Pagination({
  ariaLabel,
  current,
  locale,
  query,
  total,
}: {
  ariaLabel: string;
  current: number;
  locale: "ru" | "ro";
  query: SearchParams;
  total: number;
}) {
  const href = (page: number) => {
    const params = new URLSearchParams();
    for (const key of [
      "search",
      "status",
      "lifecycleStatus",
      "dateFrom",
      "dateTo",
    ] as const)
      if (query[key]) params.set(key, query[key]!);
    params.set("page", String(page));
    return `/cabinet/estimates?${params.toString()}`;
  };
  return (
    <NumberedPagination
      ariaLabel={ariaLabel}
      currentPage={current}
      hrefForPage={href}
      locale={locale}
      totalPages={total}
    />
  );
}
function proposalState(
  documentId: string | null,
  prepared: boolean,
  copy: ReturnType<typeof getEstimatesCopy>,
) {
  return documentId
    ? copy.pdfReady
    : prepared
      ? copy.proposalPrepared
      : copy.proposalNotPrepared;
}
