import Link from "next/link";
import { notFound } from "next/navigation";

import { getFinalCustomerAction } from "@/src/modules/estimates/actions";
import { FinalCustomerEditForm } from "@/src/modules/estimates/components/FinalCustomerEditForm";
import { EstimateStatusBadge } from "@/src/modules/estimates/components/EstimateStatusBadge";
import {
  finalCustomerIndustryLabelForLocale,
  formatPartnerDate,
  getEstimatesCopy,
} from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const [{ customerId }, locale] = await Promise.all([
    params,
    getPartnerLocale(),
  ]);
  const copy = getEstimatesCopy(locale);
  const result = await getFinalCustomerAction(customerId);
  if (!result.success) {
    if (
      result.errorCode === "NOT_FOUND" ||
      result.errorCode === "INVALID_INPUT"
    )
      notFound();
    return (
      <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
        {copy.customerLoadError}
      </p>
    );
  }
  const customer = result.data;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="border-b border-zinc-200 pb-5">
        <Link
          className="text-sm font-semibold text-emerald-700"
          href="/cabinet/customers"
        >
          ← {copy.customers}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{customer.displayName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {copy.lastActivity}:{" "}
          {customer.lastActivityAt
            ? formatPartnerDate(customer.lastActivityAt, locale)
            : copy.noActivity}
        </p>
      </header>
      <section aria-labelledby="customer-identity">
        <h2 className="text-lg font-semibold" id="customer-identity">
          {copy.customerData}
        </h2>
        <dl className="mt-4 grid gap-4 border-y border-zinc-200 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-zinc-500">{copy.type}</dt>
            <dd className="mt-1 text-sm font-medium">
              {customer.customerType === "company"
                ? copy.companyType
                : copy.individualType}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">IDNO</dt>
            <dd className="mt-1 text-sm font-medium">
              {customer.fiscalCode ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">{copy.cityRegion}</dt>
            <dd className="mt-1 text-sm font-medium">
              {customer.locality ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">{copy.industry}</dt>
            <dd className="mt-1 text-sm font-medium">
              {finalCustomerIndustryLabelForLocale(
                locale,
                customer.industryCode,
                copy.notSpecifiedFeminine,
              )}
            </dd>
          </div>
        </dl>
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800">
            {copy.editData}
          </summary>
          <div className="pt-3">
            <FinalCustomerEditForm customer={customer} />
          </div>
        </details>
      </section>
      <section aria-labelledby="customer-estimates">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" id="customer-estimates">
              {copy.relatedEstimates}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {copy.relatedEstimatesHint}
            </p>
          </div>
          <Link
            className="text-sm font-semibold text-emerald-700"
            href="/cabinet/estimates/new"
            prefetch={false}
          >
            {copy.newEstimate}
          </Link>
        </div>
        {customer.estimates.length ? (
          <div className="mt-4 divide-y divide-zinc-100 border-y border-zinc-200">
            {customer.estimates.map((estimate) => (
              <article
                className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                key={estimate.id}
              >
                <div className="min-w-0">
                  <Link
                    className="font-semibold hover:text-emerald-700"
                    href={`/cabinet/estimates/${estimate.id}`}
                    prefetch={false}
                  >
                    {estimate.estimateNumber} · {estimate.name}
                  </Link>
                  <p className="mt-1 truncate text-sm text-zinc-500">
                    {estimate.projectName ?? copy.projectMissing}
                  </p>
                </div>
                <EstimateStatusBadge locale={locale} status={estimate.status} />
                <time className="text-sm text-zinc-500">
                  {formatPartnerDate(estimate.updatedAt, locale)}
                </time>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 border-y border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500">
            {copy.noRelatedEstimates}
          </p>
        )}
      </section>
    </div>
  );
}
