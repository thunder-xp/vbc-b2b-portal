import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { actionClassName, formatBusinessAmount } from "../../platform-ui";
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
  if (overview.contracts.length === 0 && overview.paymentCalendar.current.length === 0 && overview.paymentCalendar.settled.length === 0 && overview.paymentCalendar.unavailableCount === 0) {
    return <EmptyFinanceState locale={locale} state={overview.state} />;
  }

  return (
    <div className="space-y-4">
      <PaymentCalendarOverview locale={locale} overview={overview} />
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

function PaymentCalendarOverview({ locale, overview }: { locale: PartnerLocale; overview: FinanceOverviewModel }) {
  const copy = getFinanceCopy(locale);
  const calendar = overview.paymentCalendar;
  const hasOverdue = calendar.current.some((item) => item.timing === "overdue");
  const groups = [
    ["overdue", copy.overdueGroup], ["today", copy.todayGroup], ["upcoming", copy.upcomingGroup], ["later", copy.laterGroup],
  ] as const;
  return <>
    <section className={`rounded-md border p-3 ${hasOverdue ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`} aria-labelledby="finance-current-status">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950" id="finance-current-status">{hasOverdue ? copy.paymentAttention : copy.noUrgentPayments}</h2>
          <p className={`mt-1 text-xs font-medium ${calendar.freshness === "FINANCE_DATA_FRESH" ? "text-emerald-800" : "text-amber-800"}`}>
            {calendar.freshness === "FINANCE_DATA_FRESH" ? copy.dataFresh : copy.dataStale}
          </p>
        </div>
        <a className={actionClassName.primary} href="#payment-calendar">{copy.openCalendar}</a>
      </div>
      <div className="mt-3 grid gap-2">
        {calendar.summaries.length ? calendar.summaries.map((summary) => <div className="grid gap-3 rounded bg-white p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-end" key={summary.currency}>
          <div><p className="text-xs text-zinc-500">{copy.amountDue} · {summary.currency}</p>
          <p className="text-xl font-semibold tabular-nums text-zinc-950">{formatFinanceAmount(summary.outstanding, summary.currency, locale)}</p></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-zinc-500">{copy.overdue}</p><p className="mt-1 font-semibold text-amber-800">{formatFinanceAmount(summary.overdue, summary.currency, locale)}</p></div>
            <div><p className="text-xs text-zinc-500">{copy.nearestPayment}</p><p className="mt-1 font-semibold text-zinc-900">{summary.nextPaymentDueDate && summary.nextPaymentAmount ? `${formatFinanceAmount(summary.nextPaymentAmount, summary.currency, locale)} · ${formatPartnerDate(summary.nextPaymentDueDate, locale)}` : "—"}</p></div>
          </div>
        </div>) : <div className="bg-white p-4 text-sm text-zinc-600">{copy.noCurrentObligations}</div>}
      </div>
    </section>
    <section id="payment-calendar" aria-labelledby="payment-calendar-title">
      <div>
        <h2 className="text-xl font-semibold text-zinc-950" id="payment-calendar-title">{copy.paymentCalendar}</h2>
      </div>
      {calendar.unavailableCount > 0 ? <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status" data-finance-warning>{copy.unavailableRows}</p> : null}
      {calendar.current.length ? <div className="space-y-4 pt-3">{groups.map(([timing, label]) => {
        const items = calendar.current.filter((item) => item.timing === timing);
        return items.length ? <div key={timing}><h3 className={`text-xs font-semibold uppercase tracking-wide ${timing === "overdue" ? "text-amber-800" : "text-zinc-600"}`}>{label}</h3><ul className="mt-2 divide-y divide-zinc-200 border border-zinc-200 bg-white">{items.map((item) => <PaymentItem item={item} key={item.id} locale={locale} />)}</ul></div> : null;
      })}</div> : <p className="py-8 text-sm text-zinc-600">{copy.noCurrentObligations}</p>}
      {calendar.settled.length ? <details className="mt-6 border-t border-zinc-200 pt-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-zinc-800">{copy.settledHistory} ({calendar.settled.length})</summary><ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">{calendar.settled.map((item) => <PaymentItem item={item} key={item.id} locale={locale} />)}</ul></details> : null}
    </section>
  </>;
}

function PaymentItem({ item, locale }: { item: FinanceOverviewModel["paymentCalendar"]["current"][number]; locale: PartnerLocale }) {
  const copy = getFinanceCopy(locale);
  const paymentState = item.paymentStatus === "PARTIAL" ? copy.partialStatus
    : item.paymentStatus === "OPEN" ? copy.openStatus : copy.settled;
  const timing = item.paymentStatus === "SETTLED" ? copy.settled : item.daysFromDue < 0
    ? copy.daysOverdue.replace("{count}", String(Math.abs(item.daysFromDue)))
    : item.daysFromDue === 0 ? copy.dueToday : copy.daysUntil.replace("{count}", String(item.daysFromDue));
  return <li className="grid min-w-0 gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_408px_164px] xl:items-center" data-payment-row>
    <div className="min-w-0"><p className="font-semibold text-zinc-950">{copy.order} {item.orderNumber}</p><p className="mt-1 text-sm text-zinc-600">{copy.dueDate}: {formatPartnerDate(item.dueDate, locale)}</p><p className={`mt-1 text-xs font-semibold ${item.daysFromDue < 0 && item.paymentStatus !== "SETTLED" ? "text-amber-800" : "text-zinc-500"}`}>{paymentState}{item.paymentStatus !== "SETTLED" ? ` · ${timing}` : ""}</p></div>
    <dl className="grid min-w-0 grid-cols-3 gap-3 text-sm xl:text-right"><div data-payment-amount="remaining"><dt className="text-xs text-zinc-500">{copy.remaining}</dt><dd className="mt-1 font-semibold tabular-nums text-zinc-950">{formatFinanceAmount(item.remainingAmount, item.currency, locale)}</dd></div><div data-payment-amount="paid"><dt className="text-xs text-zinc-500">{copy.paid}</dt><dd className="mt-1 tabular-nums text-zinc-700">{formatFinanceAmount(item.paidAmount, item.currency, locale)}</dd></div><div data-payment-amount="planned"><dt className="text-xs text-zinc-500">{copy.planned}</dt><dd className="mt-1 tabular-nums text-zinc-700">{formatFinanceAmount(item.plannedAmount, item.currency, locale)}</dd></div></dl>
    <Link className={`${actionClassName.secondary} min-w-0 text-center`} href={`/cabinet/orders?query=${encodeURIComponent(item.orderNumber)}`} prefetch={false}>{copy.openOrder}</Link>
  </li>;
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
    <section className="py-4" data-compact-empty>
      <WalletCards
        aria-hidden="true"
        className="size-5 text-zinc-400"
      />
      <h2 className="mt-3 text-lg font-semibold text-zinc-900">
        {content.title}
      </h2>
      <p className="mt-1 text-sm text-zinc-600">{content.text}</p>
    </section>
  );
}

function formatFinanceAmount(value: string, currency: string, locale: PartnerLocale): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${currency}`
    : "—";
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
