import Link from "next/link";

import {
  UnifiedServiceHistoryList,
  ServiceMonthlySummaryCard,
  getPartnerServiceWorkspaceAction,
} from "@/src/modules/service-history";
import { serviceCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { PartnerWarrantySerialLookup } from "@/src/modules/warranty-serials";

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; filter?: string; page?: string; month?: string }>;
}) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = serviceCopy(locale);
  const result = await getPartnerServiceWorkspaceAction(params);
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            {copy.eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{copy.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">{copy.description}</p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"
          href="/cabinet/service/new"
        >
          {copy.create}
        </Link>
      </header>
      {result.success ? (
        <ServiceMonthlySummaryCard
          filter={params.filter}
          locale={locale}
          query={params.query}
          summary={result.data.monthlySummary}
        />
      ) : null}
      <section aria-labelledby="warranty-check-title">
        <h2 className="mb-3 text-lg font-semibold" id="warranty-check-title">
          {copy.warrantyCheck}
        </h2>
        <PartnerWarrantySerialLookup />
      </section>
      <section aria-labelledby="service-history-title" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold" id="service-history-title">
            {copy.historyTitle}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {copy.historyDescription}
          </p>
        </div>
        <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          {result.success ? <input name="month" type="hidden" value={result.data.monthlySummary.month} /> : null}
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
            defaultValue={params.query}
            name="query"
            placeholder={copy.searchPlaceholder}
          />
          <select
            aria-label={copy.historyFilter}
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
            defaultValue={params.filter ?? "all"}
            name="filter"
          >
            <option value="active">{copy.active}</option>
            <option value="ready">{copy.ready}</option>
            <option value="completed">{copy.completed}</option>
            <option value="all">{copy.all}</option>
          </select>
          <button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold">
            {copy.search}
          </button>
        </form>
        {result.success ? (
          <UnifiedServiceHistoryList
            filter={params.filter}
            locale={locale}
            month={result.data.monthlySummary.month}
            page={result.data.history}
            query={params.query}
          />
        ) : (
          <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {copy.loadError}
          </p>
        )}
      </section>
    </div>
  );
}
