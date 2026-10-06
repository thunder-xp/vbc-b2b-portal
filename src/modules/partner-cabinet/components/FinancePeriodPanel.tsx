"use client";

import { AlertTriangle, CircleDollarSign } from "lucide-react";
import { useState } from "react";

import { formatPartnerDate, formatPartnerMoney, partnerText, type PartnerLocale } from "../../partner-locale";
import type { DashboardAnalyticsPeriod, FinanceGuidancePeriodDto, WorkspaceHomeDto } from "../services";

const PERIODS: DashboardAnalyticsPeriod[] = [30, 60, 90, 180];

export function FinancePeriodPanel({
  guidance,
  locale,
  synchronizedAt,
}: {
  guidance: NonNullable<WorkspaceHomeDto["financeGuidance"]>;
  locale: PartnerLocale;
  synchronizedAt: string | null;
}) {
  const [selectedDays, setSelectedDays] = useState<DashboardAnalyticsPeriod>(30);
  const periodGuidance = guidance.periods?.length
    ? guidance.periods
    : PERIODS.map((days) => ({ ...guidance, days }));
  const selected = periodGuidance.find((candidate) => candidate.days === selectedDays) ?? periodGuidance[0];

  return (
    <div className="min-w-0" data-finance-period-summary>
      <p className="mb-2 text-xs font-medium text-zinc-600">{partnerText(locale, "dashboard.financePeriodSelector")}</p>
      <div aria-label={partnerText(locale, "dashboard.financePeriodSelector")} className="grid grid-cols-4 gap-1 rounded-md bg-zinc-100 p-1" role="group">
        {PERIODS.map((days) => (
          <button
            aria-pressed={selectedDays === days}
            className={`flex min-h-11 items-center justify-center rounded px-2 text-xs font-semibold tabular-nums transition-colors hover:bg-white hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${selectedDays === days ? "bg-white text-emerald-700 shadow-sm" : "text-zinc-600"}`}
            data-finance-period-option={days}
            key={days}
            onClick={() => setSelectedDays(days)}
            type="button"
          >
            {partnerText(locale, "dashboard.salesDays").replace("{count}", String(days))}
          </button>
        ))}
      </div>
      {selected ? <div className="mt-2" data-finance-period-panel={selected.days}>
        <FinancePeriodContent guidance={selected} locale={locale} synchronizedAt={synchronizedAt} />
      </div> : null}
    </div>
  );
}

function FinancePeriodContent({
  guidance,
  locale,
  synchronizedAt,
}: {
  guidance: FinanceGuidancePeriodDto;
  locale: PartnerLocale;
  synchronizedAt: string | null;
}) {
  return <>
    <div data-analytics-context>
      <p className={`flex items-start gap-2 text-xs font-semibold ${guidance.state === "overdue" ? "text-rose-800" : guidance.state === "due_soon" ? "text-amber-800" : guidance.state === "unavailable" ? "text-zinc-600" : "text-emerald-800"}`}>{guidance.state === "overdue" ? <AlertTriangle aria-hidden="true" className="size-4 shrink-0" /> : null}{partnerText(locale, financeStateKey(guidance.state))}</p>
      <p className="mt-1 text-xs text-zinc-500">{partnerText(locale, "dashboard.balanceSnapshot")}{synchronizedAt ? ` · ${partnerText(locale, "dashboard.updated")}: ${formatDate(synchronizedAt, locale)}` : ""}</p>
    </div>
    <div className="mt-3" data-analytics-summary>
      <div className="grid gap-3 sm:grid-cols-2" data-finance-totals>
        {guidance.totals.map((total) => <dl className="grid min-w-0 grid-cols-2 gap-3 rounded-md bg-zinc-50 p-2.5" data-finance-currency={total.currency} key={total.currency}>
          <div><dt className="text-xs font-medium text-zinc-600">{partnerText(locale, "dashboard.financeOverdue")} · {total.currency}</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums text-rose-800">{formatPartnerMoney(total.overdue, total.currency, locale)}</dd></div>
          <div><dt className="text-xs font-medium text-zinc-600">{partnerText(locale, "dashboard.amountDue")} · {total.currency}</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums text-zinc-950">{formatPartnerMoney(total.outstanding, total.currency, locale)}</dd></div>
        </dl>)}
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm"><CircleDollarSign aria-hidden="true" className="size-4 shrink-0 text-emerald-700" /><span className="text-zinc-600">{partnerText(locale, "dashboard.financeNext")}:</span><strong className="tabular-nums text-zinc-950">{guidance.nextDueDate ? formatDate(guidance.nextDueDate, locale) : partnerText(locale, "dashboard.deadlineMissing")}</strong></div>
    </div>
    <PaymentGraph guidance={guidance} locale={locale} />
  </>;
}

function PaymentGraph({ guidance, locale }: { guidance: FinanceGuidancePeriodDto; locale: PartnerLocale }) {
  return (
    <div className="mt-3 border-t border-zinc-200 pt-3" data-payment-calendar>
      <div className="flex flex-wrap items-center justify-between gap-2" data-analytics-chart-header>
        <h3 className="text-sm font-semibold text-zinc-950">{partnerText(locale, "dashboard.paymentCalendar")}</h3>
        <a className="inline-flex min-h-8 items-center rounded text-xs font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" href="/cabinet/finance#payment-calendar">{partnerText(locale, "dashboard.fullCalendar")}</a>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="text-xs font-medium tabular-nums text-zinc-500" data-payment-calendar-range>
          {formatDate(guidance.calendar.startDate, locale)} — {formatDate(guidance.calendar.endDate, locale)}
        </p>
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-medium leading-4 text-zinc-600" aria-label={partnerText(locale, "dashboard.paymentLegend")}>
          <GraphLegend className="bg-rose-500" label={partnerText(locale, "dashboard.paymentOverdue")} />
          <GraphLegend className="bg-amber-500" label={partnerText(locale, "dashboard.paymentToday")} />
          <GraphLegend className="bg-emerald-600" label={partnerText(locale, "dashboard.paymentUpcoming")} />
          <GraphLegend className="bg-zinc-400" label={partnerText(locale, "dashboard.paymentPaid")} />
        </div>
      </div>
      <p className="sr-only">{partnerText(locale, "dashboard.paymentEntries")}: {guidance.paymentGraph.length}. {partnerText(locale, "dashboard.paymentPlanContext")}</p>
      {(guidance.paymentGraph.length ? [...new Set(guidance.paymentGraph.map((payment) => payment.currency))] : [""]).map((currency) => <PaymentCurrencyGraph currency={currency} guidance={guidance} key={currency} locale={locale} />)}
    </div>
  );
}

function PaymentCurrencyGraph({ currency, guidance, locale }: { currency: string; guidance: FinanceGuidancePeriodDto; locale: PartnerLocale }) {
  const payments = guidance.paymentGraph.filter((payment) => payment.currency === currency);
  return <div className="mt-2 min-w-0">
      <div
        aria-label={`${partnerText(locale, "dashboard.paymentCalendar")}${currency ? ` · ${currency}` : ""}: ${formatDate(guidance.calendar.startDate, locale)} — ${formatDate(guidance.calendar.endDate, locale)}`}
        className="relative overflow-hidden border border-zinc-200 bg-zinc-50/70"
        data-payment-scale-maximum={guidance.calendar.amountScaleMaximum}
        data-dashboard-chart-type="bar-timeline"
        data-payment-currency={currency}
        role="img"
      >
        {currency ? <p className="border-b border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-600">{currency}</p> : null}
        <div className="relative mx-4 h-20" data-payment-plot>
          <div aria-hidden="true" className="absolute inset-0 grid grid-cols-4 divide-x divide-zinc-200/50 sm:grid-cols-8" />
          <div
            aria-label={`${partnerText(locale, "dashboard.paymentToday")}: ${formatDate(guidance.calendar.today, locale)}`}
            className="absolute inset-y-0 z-20 border-l-2 border-amber-700"
            data-payment-today-marker
            role="separator"
            style={{ left: `${guidance.calendar.todayPosition}%` }}
            title={`${partnerText(locale, "dashboard.paymentToday")}: ${formatDate(guidance.calendar.today, locale)}`}
          >
            <span className={`absolute top-0 whitespace-nowrap rounded-b-sm border-x border-b border-amber-200 bg-white px-1.5 text-[10px] font-semibold leading-4 text-amber-900 ${guidance.calendar.todayPosition > 90 ? "-translate-x-full" : guidance.calendar.todayPosition > 10 ? "-translate-x-1/2" : ""}`}>
              {partnerText(locale, "dashboard.paymentToday")}
            </span>
          </div>
          {payments.length ? payments.map((payment) => {
            const state = partnerText(locale, payment.timing === "overdue" ? "dashboard.paymentOverdue" : payment.timing === "today" ? "dashboard.paymentToday" : payment.timing === "paid" ? "dashboard.paymentPaid" : "dashboard.paymentUpcoming");
            const label = `${payment.orderNumber} · ${formatDate(payment.eventDate, locale)} · ${formatPartnerMoney(payment.amount, payment.currency, locale)} · ${state}`;
            const stackOffset = (payment.stackIndex - (payment.stackCount - 1) / 2) * 8;
            return <button aria-label={label} className="absolute bottom-0 z-10 flex h-[3.75rem] w-10 items-end justify-center outline-none focus-visible:ring-2 focus-visible:ring-zinc-700" data-payment-bar data-payment-height={payment.relativeHeight} data-payment-state={payment.timing} key={payment.id} style={{ left: `${payment.positionPercent}%`, transform: `translateX(calc(-50% + ${stackOffset}px))` }} title={label} type="button">
              <span className="sr-only">{label}</span>
              <span aria-hidden="true" className={`min-h-5 w-3 rounded-t-[3px] shadow-sm sm:w-4 ${payment.timing === "overdue" ? "bg-rose-600" : payment.timing === "today" ? "bg-amber-600" : payment.timing === "paid" ? "bg-zinc-400" : "bg-emerald-700"}`} style={{ height: `${payment.relativeHeight}%` }} />
            </button>;
          }) : <p className="absolute inset-x-3 bottom-3 z-10 text-sm text-zinc-600">{partnerText(locale, "dashboard.paymentGraphEmpty")}</p>}
        </div>
        <div aria-hidden="true" className="relative mx-4 h-7 border-t border-zinc-200 bg-white" data-payment-axis>
          {guidance.calendar.axisLabels.map((label) => <span className={`absolute whitespace-nowrap text-[10px] font-medium leading-4 tabular-nums ${label.showOnMobile ? "" : "hidden sm:block"} ${label.kind === "today" ? "text-amber-800" : "text-zinc-500"} ${label.align === "start" ? "" : label.align === "end" ? "-translate-x-full" : "-translate-x-1/2"}`} data-payment-axis-date={label.date} data-payment-axis-kind={label.kind} key={`${label.kind}-${label.date}`} style={{ left: `${label.positionPercent}%`, top: label.track === 0 ? "0.25rem" : "1.25rem" }}>
            {formatAxisDate(label.date, locale)}
          </span>)}
        </div>
      </div>
    </div>;
}

function GraphLegend({ className, label }: { className: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span aria-hidden="true" className={`size-1.5 rounded-sm ${className}`} />{label}</span>;
}

function financeStateKey(state: FinanceGuidancePeriodDto["state"]) {
  if (state === "overdue") return "dashboard.financeState.overdue" as const;
  if (state === "due_soon") return "dashboard.financeState.due_soon" as const;
  if (state === "unavailable") return "dashboard.financeState.unavailable" as const;
  return "dashboard.financeState.healthy" as const;
}

function formatDate(value: string, locale: PartnerLocale): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatPartnerDate(date, locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : partnerText(locale, "dashboard.datePending");
}

function formatAxisDate(value: string, locale: PartnerLocale): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? formatPartnerDate(date, locale, { day: "2-digit", month: "short", timeZone: "UTC" }).replace(/\./g, "") : partnerText(locale, "dashboard.datePending");
}
