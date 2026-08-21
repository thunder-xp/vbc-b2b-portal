import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  WalletCards,
} from "lucide-react";

import { formatBusinessAmount } from "../../platform-ui";
import {
  formatPartnerDate,
  getFinanceCopy,
  type PartnerLocale,
} from "../../partner-locale";
import type { FinanceOverview as FinanceOverviewModel } from "../types";

export function FinanceOverview({
  locale = "ru",
  overview,
}: {
  locale?: PartnerLocale;
  overview: FinanceOverviewModel;
}) {
  const copy = getFinanceCopy(locale);
  if (overview.contracts.length === 0) {
    return <EmptyFinanceState locale={locale} state={overview.state} />;
  }

  return (
    <div className="space-y-8">
      <section
        aria-label={copy.contractSummary}
        className="rounded-md border border-zinc-200 bg-white px-5 py-4"
      >
        <p className="text-xs font-semibold uppercase text-zinc-500">
          {copy.activeContracts}
        </p>
        <p className="mt-1 text-2xl font-semibold text-zinc-950">
          {overview.contracts.length}
        </p>
        {overview.synchronizedAt ? (
          <p className="mt-2 text-xs text-zinc-500">
            {copy.updated} {formatPartnerDate(overview.synchronizedAt, locale, { dateStyle: "short", timeStyle: "short" })}
          </p>
        ) : null}
      </section>
      <section
        aria-label={copy.currencyTotals}
        className="grid gap-px overflow-hidden border border-zinc-200 bg-zinc-200 sm:grid-cols-2"
      >
        {overview.summaries.flatMap((summary) => [
          <Summary
            key={`${summary.currencyCode}-receivable`}
            icon={ArrowUpRight}
            label={copy.amountDue}
            amount={summary.receivableTotal}
            currency={summary.currencyCode}
            tone="attention"
          />,
          <Summary
            key={`${summary.currencyCode}-advance`}
            icon={ArrowDownLeft}
            label={copy.advance}
            amount={summary.advanceTotal}
            currency={summary.currencyCode}
            tone="positive"
          />,
        ])}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-700">
              {copy.title}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              {copy.contractBalance}
            </h2>
          </div>
          {overview.synchronizedAt && (
            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock3 className="size-3.5" />
              {copy.updated} {formatPartnerDate(overview.synchronizedAt, locale, { dateStyle: "short", timeStyle: "short" })}
            </p>
          )}
        </div>
        <div className="divide-y divide-zinc-200">
          {overview.contracts.map((contract) => (
            <article
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={contract.id}
            >
              <div className="min-w-0">
                <h3 className="font-semibold text-zinc-950">
                  {contract.contractNumber || contract.contractName}
                </h3>
                {contract.contractName !== contract.contractNumber && (
                  <p className="mt-1 truncate text-sm text-zinc-500">
                    {contract.contractName}
                  </p>
                )}
                <p
                  className={`mt-2 inline-flex items-center gap-1.5 text-sm font-medium ${contract.balanceType === "receivable" ? "text-amber-700" : "text-emerald-700"}`}
                >
                  {contract.balanceType === "receivable" ? (
                    <AlertCircle className="size-4" />
                  ) : (
                    <ArrowDownLeft className="size-4" />
                  )}
                  {contract.balanceType === "receivable" ? copy.amountDue : copy.advance}
                </p>
              </div>
              <p className="text-lg font-semibold tabular-nums text-zinc-950">
                {formatBusinessAmount(
                  contract.absoluteDisplayAmount,
                  contract.currencyCode,
                )}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyFinanceState({
  locale,
  state,
}: {
  locale: PartnerLocale;
  state: FinanceOverviewModel["state"];
}) {
  const copy = getFinanceCopy(locale);
  const content =
    state === "synchronized_zero"
      ? {
          title: copy.noBalances,
          text: copy.noBalancesText,
        }
      : state === "never_synchronized"
        ? {
            title: copy.neverLoaded,
            text: copy.neverLoadedText,
          }
        : state === "mapping_missing"
          ? {
              title: copy.mappingMissing,
              text: copy.mappingMissingText,
            }
          : {
              title: copy.temporarilyUnavailable,
              text: copy.temporarilyUnavailableText,
            };
  return (
    <section className="border-t border-zinc-200 py-12 text-center">
      <WalletCards
        aria-hidden="true"
        className="mx-auto size-8 text-zinc-400"
      />
      <h2 className="mt-3 text-lg font-semibold text-zinc-900">
        {content.title}
      </h2>
      <p className="mt-1 text-sm text-zinc-600">{content.text}</p>
    </section>
  );
}

function Summary({
  amount,
  currency,
  icon: Icon,
  label,
  tone,
}: {
  amount: string;
  currency: string;
  icon: typeof ArrowUpRight;
  label: string;
  tone: "attention" | "positive";
}) {
  return (
    <div className="bg-white p-5">
      <div className="flex items-center gap-2 text-sm text-zinc-600">
        <Icon
          className={`size-4 ${tone === "attention" ? "text-amber-600" : "text-emerald-600"}`}
        />
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-950">
        {formatBusinessAmount(amount, currency)}
      </p>
    </div>
  );
}
