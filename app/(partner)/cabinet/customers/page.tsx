import { Search, UsersRound } from "lucide-react";
import Link from "next/link";

import { listFinalCustomersAction } from "@/src/modules/estimates/actions";
import { FinalCustomerDialog } from "@/src/modules/estimates/components/FinalCustomerDialog";
import { FINAL_CUSTOMER_INDUSTRIES } from "@/src/modules/estimates/types";
import { NumberedPagination } from "@/src/modules/platform-ui";
import {
  finalCustomerIndustryLabelForLocale,
  formatPartnerDate,
  getEstimatesCopy,
} from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

type SearchParams = { search?: string; industry?: string; page?: string };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [query, locale] = await Promise.all([searchParams, getPartnerLocale()]);
  const copy = getEstimatesCopy(locale);
  const page = Number.parseInt(query.page ?? "1", 10) || 1;
  const result = await listFinalCustomersAction({
    search: query.search,
    industryCode: query.industry,
    page,
  });

  return (
    <div className="app-content-wide space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            {copy.title}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{copy.customers}</h1>
          <p className="mt-1 text-sm text-zinc-500">{copy.customersHint}</p>
        </div>
        <FinalCustomerDialog label={copy.addCustomer} />
      </header>
      <form className="grid min-w-0 gap-3 border-b border-zinc-200 pb-5 sm:grid-cols-[minmax(0,1fr)_16rem_auto]">
        <label className="relative min-w-0">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-3.5 size-4 text-zinc-400"
          />
          <span className="sr-only">{copy.customerSearch}</span>
          <input
            className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 pl-9 pr-3 text-sm"
            defaultValue={query.search}
            name="search"
            placeholder={copy.nameOrIdno}
          />
        </label>
        <label>
          <span className="sr-only">{copy.industry}</span>
          <select
            className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
            defaultValue={query.industry ?? ""}
            name="industry"
          >
            <option value="">{copy.allIndustries}</option>
            {FINAL_CUSTOMER_INDUSTRIES.map((industry) => (
              <option key={industry.code} value={industry.code}>
                {finalCustomerIndustryLabelForLocale(
                  locale,
                  industry.code,
                  copy.notSpecifiedFeminine,
                )}
              </option>
            ))}
          </select>
        </label>
        <button
          className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white"
          type="submit"
        >
          {copy.find}
        </button>
      </form>
      {!result.success ? (
        <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
          {copy.customerLoadError}
        </p>
      ) : result.data.records.length ? (
        <>
          <div className="hidden overflow-x-auto border-y border-zinc-200 bg-white md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">{copy.customer}</th>
                  <th className="px-4 py-3">{copy.cityRegion}</th>
                  <th className="px-4 py-3">{copy.industry}</th>
                  <th className="px-4 py-3 text-right">{copy.estimate}</th>
                  <th className="px-4 py-3">{copy.lastEstimate}</th>
                  <th className="px-4 py-3">{copy.lastProject}</th>
                  <th className="px-4 py-3">{copy.customerActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {result.data.records.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-4 py-4">
                      <Link
                        className="font-semibold hover:text-emerald-700"
                        href={`/cabinet/customers/${customer.id}`}
                        prefetch={false}
                      >
                        {customer.displayName}
                      </Link>
                      <p className="mt-1 text-xs text-zinc-500">
                        {customer.fiscalCode ?? copy.idnoMissing}
                      </p>
                    </td>
                    <td className="px-4 py-4">{customer.locality ?? "—"}</td>
                    <td className="px-4 py-4">
                      {finalCustomerIndustryLabelForLocale(
                        locale,
                        customer.industryCode,
                        copy.notSpecifiedFeminine,
                      )}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      {customer.estimateCount}
                    </td>
                    <td className="px-4 py-4">
                      {customer.lastEstimateId ? (
                        <Link
                          className="font-medium hover:text-emerald-700"
                          href={`/cabinet/estimates/${customer.lastEstimateId}`}
                          prefetch={false}
                        >
                          {customer.lastEstimateNumber}
                          <span className="mt-1 block text-xs font-normal text-zinc-500">
                            {customer.lastEstimateAt
                              ? formatPartnerDate(
                                  customer.lastEstimateAt,
                                  locale,
                                )
                              : "—"}
                          </span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-4">
                      {customer.lastProjectName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <FinalCustomerDialog customer={customer} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {result.data.records.map((customer) => (
              <article
                className="border-y border-zinc-200 bg-white py-4"
                key={customer.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    className="font-semibold text-zinc-950"
                    href={`/cabinet/customers/${customer.id}`}
                    prefetch={false}
                  >
                    {customer.displayName}
                  </Link>
                  <FinalCustomerDialog customer={customer} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <dt className="text-zinc-500">{copy.cityRegion}</dt>
                  <dd>{customer.locality ?? "—"}</dd>
                  <dt className="text-zinc-500">{copy.industry}</dt>
                  <dd>
                    {finalCustomerIndustryLabelForLocale(
                      locale,
                      customer.industryCode,
                      copy.notSpecifiedFeminine,
                    )}
                  </dd>
                  <dt className="text-zinc-500">{copy.estimateCount}</dt>
                  <dd>{customer.estimateCount}</dd>
                  <dt className="text-zinc-500">{copy.lastProject}</dt>
                  <dd>{customer.lastProjectName ?? "—"}</dd>
                </dl>
              </article>
            ))}
          </div>
          <NumberedPagination
            ariaLabel={copy.customerPages}
            currentPage={result.data.page}
            hrefForPage={(target) => customerPageHref(query, target)}
            locale={locale}
            totalPages={result.data.totalPages}
          />
        </>
      ) : (
        <section className="border-y border-dashed border-zinc-300 py-14 text-center">
          <UsersRound className="mx-auto size-8 text-emerald-700" />
          <h2 className="mt-4 font-semibold">{copy.customersEmpty}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {copy.customersEmptyHint}
          </p>
          <div className="mt-5">
            <FinalCustomerDialog label={copy.addCustomer} />
          </div>
        </section>
      )}
    </div>
  );
}

function customerPageHref(query: SearchParams, page: number) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.industry) params.set("industry", query.industry);
  params.set("page", String(page));
  return `/cabinet/customers?${params.toString()}`;
}
