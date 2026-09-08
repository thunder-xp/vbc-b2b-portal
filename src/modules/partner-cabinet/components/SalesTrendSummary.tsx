import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";

import {
  formatPartnerMoney,
  formatPartnerDate,
  formatPartnerNumber,
  partnerText,
  type PartnerLocale,
} from "../../partner-locale";
import type {
  SalesTrendComparisonDto,
  SalesTrendPeriod,
  SalesTrendState,
  WorkspaceHomeDto,
} from "../services";

const PERIODS: SalesTrendPeriod[] = [30, 60, 90, 180];

type SalesSeries = NonNullable<WorkspaceHomeDto["salesAnalytics"]>["series"][number];

export function SalesTrendSummary({
  locale,
  series,
}: {
  locale: PartnerLocale;
  series: SalesSeries[];
}) {
  return (
    <fieldset className="min-w-0" data-sales-trend-summary>
      <legend className="sr-only">{partnerText(locale, "dashboard.salesPeriodSelector")}</legend>
      {PERIODS.map((days) => (
        <input
          aria-label={partnerText(locale, "dashboard.salesDays").replace("{count}", String(days))}
          className="sr-only"
          data-sales-period-option={days}
          defaultChecked={days === 30}
          id={`dashboard-sales-period-${days}`}
          key={days}
          name="dashboard-sales-period"
          type="radio"
          value={days}
        />
      ))}
      <div
        className="grid grid-cols-4 gap-1 rounded-md bg-zinc-100 p-1"
        data-sales-period-selector
      >
        {PERIODS.map((days) => (
          <label
            className="flex min-h-11 cursor-pointer items-center justify-center rounded px-2 text-xs font-semibold tabular-nums text-zinc-600 transition-colors hover:bg-white hover:text-zinc-950"
            data-sales-period-label={days}
            htmlFor={`dashboard-sales-period-${days}`}
            key={days}
          >
            {partnerText(locale, "dashboard.salesDays").replace("{count}", String(days))}
          </label>
        ))}
      </div>

      {PERIODS.map((days) => {
        const selectedRange = series[0]?.comparisons.find((comparison) => comparison.days === days);
        if (!selectedRange) return null;
        return (
          <div className="sales-trend-period-panel mt-2" data-sales-period-panel={days} key={days}>
            <p className="text-xs font-medium tabular-nums text-zinc-500" data-sales-period>
              {formatPeriodDate(selectedRange.currentStart, locale)} — {formatPeriodDate(selectedRange.currentEnd, locale)}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2" data-sales-metrics>
              {series.map((currencySeries) => {
                const comparison = currencySeries.comparisons.find((candidate) => candidate.days === days);
                if (!comparison) return null;
                return (
                  <CurrencyTrendCard
                    comparison={comparison}
                    currency={currencySeries.currency}
                    key={currencySeries.currency}
                    locale={locale}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

function CurrencyTrendCard({
  comparison,
  currency,
  locale,
}: {
  comparison: SalesTrendComparisonDto;
  currency: string;
  locale: PartnerLocale;
}) {
  const presentation = trendPresentation(comparison.state);
  const Icon = presentation.icon;
  const trendLabel = comparison.changePercent === null
    ? partnerText(locale, presentation.label)
    : `${formatPartnerNumber(comparison.changePercent, locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        signDisplay: comparison.state === "UNCHANGED" ? "never" : "always",
      })}% · ${partnerText(locale, presentation.label)}`;
  const comparisonContext = partnerText(locale, "dashboard.salesCompareYear")
    .replace("{year}", comparison.previousEnd.slice(0, 4));

  return (
    <article
      className="min-w-0 border border-zinc-200 bg-zinc-50 p-3"
      data-sales-currency-summary={currency}
      data-sales-trend-state={comparison.state}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-500">{currency}</p>
        <p className={`flex items-center gap-1 text-xs font-semibold ${presentation.className}`} data-sales-change>
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span>{trendLabel}</span>
        </p>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{partnerText(locale, "dashboard.salesForPeriod")}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-950">
        {formatPartnerMoney(comparison.currentAmount, currency, locale)}
      </p>
      <p className="mt-1 text-xs text-zinc-500" data-sales-comparison-context>
        {comparisonContext}: <span className="tabular-nums">{formatPartnerMoney(comparison.previousAmount, currency, locale)}</span>
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-zinc-200 pt-2 text-xs">
        <div>
          <dt className="text-zinc-500">{partnerText(locale, "dashboard.salesOrders")}</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-zinc-900">{comparison.currentOrderCount}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">{partnerText(locale, "dashboard.salesAverageOrder")}</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-zinc-900">
            {formatPartnerMoney(comparison.currentAverageOrder, currency, locale)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function formatPeriodDate(value: string, locale: PartnerLocale): string {
  return formatPartnerDate(new Date(`${value}T00:00:00Z`), locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function trendPresentation(state: SalesTrendState): {
  className: string;
  icon: typeof ArrowUpRight;
  label:
    | "dashboard.salesTrendIncrease"
    | "dashboard.salesTrendDecrease"
    | "dashboard.salesTrendUnchanged"
    | "dashboard.salesTrendNewActivity"
    | "dashboard.salesTrendNoActivity";
} {
  switch (state) {
    case "INCREASE":
      return { className: "text-emerald-700", icon: ArrowUpRight, label: "dashboard.salesTrendIncrease" };
    case "DECREASE":
      return { className: "text-rose-700", icon: ArrowDownRight, label: "dashboard.salesTrendDecrease" };
    case "NEW_ACTIVITY":
      return { className: "text-sky-700", icon: Sparkles, label: "dashboard.salesTrendNewActivity" };
    case "NO_ACTIVITY":
      return { className: "text-zinc-500", icon: Minus, label: "dashboard.salesTrendNoActivity" };
    case "UNCHANGED":
      return { className: "text-zinc-600", icon: Minus, label: "dashboard.salesTrendUnchanged" };
    default:
      return { className: "text-zinc-500", icon: Minus, label: "dashboard.salesTrendNoActivity" };
  }
}
