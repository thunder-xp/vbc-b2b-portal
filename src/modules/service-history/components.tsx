import Link from "next/link";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, TrendingUp } from "lucide-react";

import { ProductLineThumbnail } from "@/src/modules/catalog/components/ProductLineThumbnail";
import {
  formatPartnerDate,
  partnerStatusLabel,
  warrantyStateLabel,
  type PartnerLocale,
} from "@/src/modules/partner-locale";
import {
  ONE_C_SERVICE_STATUS_LABELS,
  type AdminOneCServiceHistoryPage,
  type OneCServiceHistoryDetail,
  type ServiceAnalytics,
  type ServiceMonthlySummary,
  type UnifiedServiceHistoryPage,
} from "./types";

const portalStatusLabels: Record<string, string> = {
  created: "Заявка создана",
  accepted: "Принята",
  awaiting_equipment: "Ожидается оборудование",
  equipment_received: "Оборудование получено",
  diagnostics: "Диагностика",
  awaiting_information: "Ожидается информация",
  repair: "В ремонте",
  replacement_approved: "Одобрена замена",
  awaiting_replacement: "Ожидается замена",
  ready_for_pickup: "Готово к выдаче",
  closed: "Закрыто",
  rejected: "Отклонено",
  cancelled: "Отменено",
};

export function UnifiedServiceHistoryList({
  page,
  query = "",
  filter = "all",
  locale = "ru",
  month,
}: {
  page: UnifiedServiceHistoryPage;
  query?: string;
  filter?: string;
  locale?: PartnerLocale;
  month?: string;
}) {
  const copy = historyCopy(locale);
  if (!page.items.length) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center">
        <h3 className="font-semibold">{copy.empty}</h3>
        <p className="mt-2 text-sm text-zinc-600">{copy.emptyHint}</p>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(page.total / 20));
  return (
    <>
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <ul className="divide-y divide-zinc-200">
          {page.items.map((item) => (
            <li key={`${item.sourceType}:${item.id}`}>
              <div className="grid min-h-28 grid-cols-[64px_minmax(0,1fr)] items-start gap-3 p-4 hover:bg-zinc-50 sm:grid-cols-[64px_minmax(0,1fr)_170px_140px_auto] sm:items-center">
                <ProductLineThumbnail
                  href={item.productHref ?? undefined}
                  imageUrl={item.productImageUrl}
                  productName={item.productName ?? copy.equipment}
                  size="service"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-emerald-700">
                    {item.number}
                  </p>
                  {item.productHref ? (
                    <Link
                      className="mt-1 block line-clamp-2 font-medium hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      href={item.productHref}
                      prefetch={false}
                      title={item.productName ?? undefined}
                    >
                      {item.productName ?? copy.equipmentPending}
                    </Link>
                  ) : (
                    <p
                      className="mt-1 line-clamp-2 font-medium"
                      title={item.productName ?? undefined}
                    >
                      {item.productName ?? copy.equipmentPending}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-500">
                    {[item.productSku, item.maskedSerial]
                      .filter(Boolean)
                      .join(" · ") || copy.noMarking}
                  </p>
                  {item.workSummary ?? item.reportedFault ? (
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                      {item.workSummary ?? item.reportedFault}
                    </p>
                  ) : null}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-xs font-semibold uppercase text-zinc-500">{copy.serviceCost}</p>
                  <p className="mt-1 whitespace-nowrap text-sm font-semibold text-zinc-900">
                    {item.serviceAmount !== null && item.currency
                      ? formatDecimalMoney(item.serviceAmount, item.currency)
                      : copy.notProvided}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-sm font-medium text-zinc-900">
                    {statusLabel(item.status, locale)}
                  </p>
                  {item.status === "ready_for_pickup" ? (
                    <p className="mt-1 text-sm font-semibold text-emerald-700">
                      {copy.ready}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatPartnerDate(item.date, locale)}
                  </p>
                </div>
                <Link
                  className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:col-span-1"
                  href={item.href}
                  prefetch={false}
                >
                  {copy.open}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {pages > 1 ? (
        <nav
          aria-label={copy.pages}
          className="flex items-center justify-between gap-3"
        >
          <PaginationLink
            disabled={page.page <= 1}
            filter={filter}
            month={month}
            page={page.page - 1}
            query={query}
          >
            {copy.back}
          </PaginationLink>
          <span className="text-sm text-zinc-600">
            {copy.page} {page.page} {copy.of} {pages}
          </span>
          <PaginationLink
            disabled={page.page >= pages}
            filter={filter}
            month={month}
            page={page.page + 1}
            query={query}
          >
            {copy.next}
          </PaginationLink>
        </nav>
      ) : null}
    </>
  );
}

export function OneCServiceHistorySummary({
  detail,
  internal = false,
  locale = "ru",
}: {
  detail: OneCServiceHistoryDetail;
  internal?: boolean;
  locale?: PartnerLocale;
}) {
  const copy = historyCopy(locale);
  return (
    <div className="space-y-7">
      <section className="grid gap-4 border-b border-zinc-200 pb-6 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label={copy.status}
          value={
            internal
              ? ONE_C_SERVICE_STATUS_LABELS[detail.status]
              : statusLabel(detail.status, locale)
          }
        />
        <Metric
          label={copy.receivedOn}
          value={formatPartnerDate(detail.date, locale)}
        />
        <Metric
          label={copy.serial}
          value={detail.serial ?? detail.maskedSerial ?? copy.notProvided}
        />
        <Metric
          label={copy.warranty}
          value={warrantyLabel(detail.warrantyState, locale)}
        />
      </section>
      <section className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-5 sm:grid-cols-[120px_minmax(0,1fr)]">
        <ProductLineThumbnail
          href={detail.product.href ?? undefined}
          imageUrl={detail.product.imageUrl}
          productName={detail.product.name ?? copy.equipment}
          size="detail"
        />
        <div>
          <h2 className="text-lg font-semibold">
            {detail.product.name ?? copy.equipmentPending}
          </h2>
          {detail.product.sku ? (
            <p className="mt-1 text-sm text-zinc-500">
              SKU: {detail.product.sku}
            </p>
          ) : null}
          {detail.product.href ? (
            <Link
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700"
              href={detail.product.href}
            >
              {copy.openProduct}
            </Link>
          ) : null}
        </div>
      </section>
      <section aria-labelledby="service-financial-title" className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="text-base font-semibold" id="service-financial-title">{copy.serviceCost}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Metric
            label={copy.total}
            value={detail.serviceAmount !== null && detail.currency
              ? formatDecimalMoney(detail.serviceAmount, detail.currency)
              : copy.notProvided}
          />
          <Metric
            label={copy.includingVat}
            value={detail.vatAmount !== null && detail.currency
              ? formatDecimalMoney(detail.vatAmount, detail.currency)
              : copy.notProvided}
          />
        </div>
        {detail.sumIncludesVat === true ? <p className="mt-3 text-xs text-zinc-500">{copy.grossVatNote}</p> : null}
      </section>
      <TextSection
        title={copy.reportedFault}
        value={detail.reportedFault ?? copy.noDescription}
      />
      {detail.completedWorkSummary ? (
        <TextSection
          title={internal ? "Содержание выполненных работ" : copy.completedWork}
          value={detail.completedWorkSummary}
        />
      ) : null}
      {detail.resolution ? (
        <TextSection title={copy.serviceResult} value={detail.resolution} />
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2">
        <Metric label={copy.completedOn} value={formatOptionalDate(detail.repairCompletedAt, locale, copy.notProvided)} />
        <Metric label={copy.issuedOn} value={formatOptionalDate(detail.issuedAt, locale, copy.notProvided)} />
        {detail.contract ? <Metric label={copy.contract} value={detail.contract} /> : null}
        <Metric
          label={copy.warrantyUntil}
          value={formatOptionalDate(
            detail.warrantyEndDate,
            locale,
            copy.notProvided,
          )}
        />
        <Metric
          label={copy.serviceCenter}
          value={detail.serviceCenter ?? copy.notProvided}
        />
      </section>
      {detail.events.length ? (
        <section>
          <h2 className="text-lg font-semibold">{copy.statusHistory}</h2>
          <ol className="mt-3 space-y-3">
            {detail.events.map((event) => (
              <li
                className="flex flex-col gap-1 border-l-2 border-emerald-200 pl-3 sm:flex-row sm:justify-between"
                key={event.id}
              >
                <span className="text-sm text-zinc-700">
                  {statusLabel(event.status, locale)}
                </span>
                <time className="text-xs text-zinc-500">
                  {formatPartnerDate(event.occurredAt, locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

export function ServiceMonthlySummaryCard({
  filter,
  locale,
  query,
  summary,
}: {
  filter?: string;
  locale: PartnerLocale;
  query?: string;
  summary: ServiceMonthlySummary;
}) {
  const copy = historyCopy(locale);
  const hasData = summary.currencies.length > 0;
  return (
    <section aria-labelledby="service-month-summary-title" className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">{copy.monthlyTitle}</p>
          <h2 className="mt-1 text-lg font-semibold capitalize" id="service-month-summary-title">{formatMonth(summary.month, locale)}</h2>
        </div>
        <div className="flex gap-2">
          <MonthLink ariaLabel={copy.previousMonth} disabled={!summary.previousMonth} href={monthHref(summary.previousMonth, query, filter)}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </MonthLink>
          <MonthLink ariaLabel={copy.nextMonth} disabled={!summary.nextMonth} href={monthHref(summary.nextMonth, query, filter)}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </MonthLink>
        </div>
      </div>
      {hasData ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {summary.currencies.map((bucket) => (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-zinc-50 p-4 text-sm lg:grid-cols-1" key={bucket.currency}>
              <Metric label={copy.servicesProvided} value={String(bucket.completedServiceCount)} />
              <Metric label={copy.monthlyTotal} value={formatDecimalMoney(bucket.totalServiceAmount, bucket.currency)} />
              <div className="col-span-2 lg:col-span-1">
                <Metric label={copy.includingVat} value={formatDecimalMoney(bucket.totalVatAmount, bucket.currency)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-600">{copy.noCompletedServices}</p>
      )}
      {summary.unknownCurrencyCount > 0 ? <p className="mt-3 text-sm text-amber-700">{copy.currencyPending}</p> : null}
    </section>
  );
}

export function ServiceAnalyticsPanel({ analytics, locale }: { analytics: ServiceAnalytics; locale: PartnerLocale }) {
  const copy = analyticsCopy(locale);
  const currencies = [...new Set(analytics.trend.map((point) => point.currency))];
  const hasSelectedData = analytics.summaries.some((summary) => summary.completedServiceCount > 0);
  return (
    <section aria-labelledby="service-analytics-title" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">{copy.eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold" id="service-analytics-title">{copy.title}</h2>
          <p className="mt-1 text-sm text-zinc-600">{copy.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-50" href={`/api/service/export/xlsx?month=${analytics.month}`}>
            <FileSpreadsheet aria-hidden="true" className="size-4" /> XLSX
          </a>
          <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-50" href={`/api/service/export/pdf?month=${analytics.month}`}>
            <FileText aria-hidden="true" className="size-4" /> PDF
          </a>
        </div>
      </div>

      {!hasSelectedData ? (
        <p className="rounded-md border border-dashed border-zinc-300 p-5 text-sm text-zinc-600">{copy.empty}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {analytics.summaries.filter((summary) => summary.completedServiceCount > 0).map((summary) => (
            <article className="rounded-md border border-zinc-200 bg-white p-4" key={summary.currency}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold">{summary.currency}</h3>
                <span className="text-xs text-zinc-500">{copy.comparedWithPrevious}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Metric label={copy.completedCount} value={String(summary.completedServiceCount)} />
                <Metric label={copy.average} value={formatDecimalMoney(summary.averageServiceAmount, summary.currency)} />
                <DeltaMetric label={copy.countChange} value={summary.countDelta} />
                <DeltaMetric currency={summary.currency} label={copy.amountChange} value={summary.amountDelta} />
              </div>
            </article>
          ))}
        </div>
      )}

      {currencies.length ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp aria-hidden="true" className="size-5 text-emerald-700" />
            <h3 className="text-lg font-semibold">{copy.trend}</h3>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {currencies.map((currency) => (
              <ServiceTrendChart analytics={analytics} currency={currency} key={currency} locale={locale} />
            ))}
          </div>
        </div>
      ) : null}

      {hasSelectedData ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownCard
            copy={{ title: copy.products, hint: copy.productsHint, empty: copy.noProducts, count: copy.completedCount }}
            items={analytics.productBreakdown.map((item) => ({
              key: `${item.currency}:${item.productId ?? item.productSku ?? item.productName}`,
              label: [item.productSku, item.productName].filter(Boolean).join(" · ") || copy.unknownProduct,
              count: item.completedServiceCount,
              amount: formatDecimalMoney(item.totalServiceAmount, item.currency),
            }))}
          />
          <BreakdownCard
            copy={{ title: copy.work, hint: copy.workHint, empty: copy.noWork, count: copy.completedCount }}
            items={analytics.workBreakdown.map((item) => ({
              key: `${item.currency}:${item.workDescription}`,
              label: item.workDescription,
              count: item.completedServiceCount,
              amount: formatDecimalMoney(item.totalServiceAmount, item.currency),
            }))}
          />
        </div>
      ) : null}
    </section>
  );
}

function ServiceTrendChart({ analytics, currency, locale }: { analytics: ServiceAnalytics; currency: string; locale: PartnerLocale }) {
  const points = analytics.trend.filter((point) => point.currency === currency);
  return (
    <article aria-label={`${analyticsCopy(locale).trend}: ${currency}`} className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold">{currency}</h4>
        <span className="text-xs text-zinc-500">12 {analyticsCopy(locale).months}</span>
      </div>
      <div className="mt-4 grid h-44 grid-cols-12 items-end gap-1" role="img">
        {points.map((point, index) => (
          <div className="flex h-full min-w-0 flex-col justify-end" key={point.month} title={`${formatMonth(point.month, locale)}: ${formatDecimalMoney(point.totalServiceAmount, currency)} · ${point.completedServiceCount}`}>
            <div className="flex flex-1 items-end rounded-sm bg-zinc-100 px-0.5">
              <div
                aria-hidden="true"
                className={`w-full rounded-sm ${point.month === analytics.month ? "bg-emerald-700" : "bg-emerald-300"}`}
                style={{ height: point.relativeAmountBps > 0 ? `${Math.max(6, point.relativeAmountBps / 100)}%` : "0%" }}
              />
            </div>
            <span className="mt-2 truncate text-center text-[10px] text-zinc-500">
              {index % 3 === 0 || index === points.length - 1 ? formatShortMonth(point.month, locale) : ""}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function BreakdownCard({ copy, items }: { copy: { title: string; hint: string; empty: string; count: string }; items: Array<{ key: string; label: string; count: number; amount: string }> }) {
  return (
    <article className="rounded-md border border-zinc-200 bg-white p-4">
      <h3 className="font-semibold">{copy.title}</h3>
      <p className="mt-1 text-xs text-zinc-500">{copy.hint}</p>
      {items.length ? (
        <ol className="mt-3 divide-y divide-zinc-100">
          {items.map((item, index) => (
            <li className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 py-2 text-sm" key={item.key}>
              <span className="text-xs text-zinc-400">{index + 1}</span>
              <span className="min-w-0 break-words text-zinc-800">{item.label}</span>
              <span className="text-right"><strong>{item.amount}</strong><span className="block text-xs text-zinc-500">{copy.count}: {item.count}</span></span>
            </li>
          ))}
        </ol>
      ) : <p className="mt-3 text-sm text-zinc-600">{copy.empty}</p>}
    </article>
  );
}

function DeltaMetric({ currency, label, value }: { currency?: string; label: string; value: number | string }) {
  const raw = typeof value === "number" ? String(value) : value;
  const sign = raw.startsWith("-") || raw === "0" || raw === "0.00" ? "" : "+";
  const formatted = currency ? formatDecimalMoney(raw, currency) : raw;
  return <Metric label={label} value={`${sign}${formatted}`} />;
}

export function AdminOneCServiceHistoryList({
  page,
}: {
  page: AdminOneCServiceHistoryPage;
}) {
  if (!page.items.length)
    return (
      <p className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
        Импортированных документов пока нет.
      </p>
    );
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <ul className="divide-y divide-zinc-200">
        {page.items.map((item) => (
          <li key={item.id}>
            <Link
              className="grid min-h-20 gap-2 p-4 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:grid-cols-[150px_minmax(0,1fr)_190px_auto] sm:items-center"
              href={item.href}
            >
              <div>
                <p className="font-semibold">{item.number}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(item.date).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <div>
                <p className="font-medium">
                  {item.product_name ?? "Товар не сопоставлен"}
                </p>
                <p className="text-xs text-zinc-500">
                  {item.company_name ?? "Компания не сопоставлена"}
                  {item.sku ? ` · ${item.sku}` : ""}
                </p>
              </div>
              <span className="text-sm">
                {ONE_C_SERVICE_STATUS_LABELS[item.status]}
              </span>
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Только чтение
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusLabel(status: string, locale: PartnerLocale) {
  return locale === "ru"
    ? (ONE_C_SERVICE_STATUS_LABELS[
        status as keyof typeof ONE_C_SERVICE_STATUS_LABELS
      ] ??
        portalStatusLabels[status] ??
        "Статус уточняется")
    : partnerStatusLabel(locale, "service", status);
}
function warrantyLabel(value: string | null, locale: PartnerLocale) {
  return locale === "ro"
    ? warrantyStateLabel(locale, value ?? "verification_required")
    : ((
        {
          eligible: "Гарантия подтверждена",
          covered: "Гарантия подтверждена",
          active: "Гарантия действует",
          expired: "Гарантия истекла",
          returned: "Оборудование возвращено",
          cancelled: "Гарантия не действует",
          warranty_period_missing: "Срок гарантии уточняется",
          sale_confirmed_review_required: "Требует проверки",
          source_incomplete: "Требует проверки",
          manual_review_required: "Требует проверки",
          conflict: "Требует проверки",
        } as Record<string, string>
      )[value ?? ""] ?? "Требует проверки");
}
function formatOptionalDate(
  value: string | null,
  locale: PartnerLocale,
  fallback: string,
) {
  return value ? formatPartnerDate(value, locale) : fallback;
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <dl>
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-zinc-900">{value}</dd>
    </dl>
  );
}

function MonthLink({ ariaLabel, children, disabled, href }: { ariaLabel: string; children: React.ReactNode; disabled: boolean; href: string }) {
  if (disabled) return <span aria-disabled="true" aria-label={ariaLabel} className="inline-flex size-11 items-center justify-center rounded-md border border-zinc-200 text-zinc-300">{children}</span>;
  return <Link aria-label={ariaLabel} className="inline-flex size-11 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={href}>{children}</Link>;
}

function monthHref(month: string | null, query?: string, filter?: string) {
  if (!month) return "/cabinet/service";
  const params = new URLSearchParams({ month });
  if (query) params.set("query", query);
  if (filter) params.set("filter", filter);
  return `/cabinet/service?${params}`;
}

function formatMonth(month: string, locale: PartnerLocale) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-RU", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, monthNumber! - 1, 1)));
}

function formatShortMonth(month: string, locale: PartnerLocale) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-RU", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, monthNumber! - 1, 1)))
    .replace(".", "");
}

export function formatDecimalMoney(amount: string, currency: string) {
  const match = amount.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return `${amount} ${currency}`;
  const integer = match[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fraction = (match[3] ?? "").padEnd(2, "0").slice(0, 2);
  return `${match[1]}${integer},${fraction} ${currency}`;
}
function TextSection({ title, value }: { title: string; value: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{value}</p>
    </section>
  );
}
function PaginationLink({
  children,
  disabled,
  filter,
  page,
  query,
  month,
}: {
  children: React.ReactNode;
  disabled: boolean;
  filter: string;
  page: number;
  query: string;
  month?: string;
}) {
  if (disabled)
    return (
      <span
        aria-disabled="true"
        className="inline-flex min-h-11 items-center px-3 text-sm text-zinc-400"
      >
        {children}
      </span>
    );
  const params = new URLSearchParams({ filter, page: String(page) });
  if (query) params.set("query", query);
  if (month) params.set("month", month);
  return (
    <Link
      className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold"
      href={`/cabinet/service?${params}`}
    >
      {children}
    </Link>
  );
}

function historyCopy(locale: PartnerLocale) {
  return locale === "ro"
    ? {
        empty: "Istoricul este gol",
        emptyHint:
          "Documentele de service și solicitările vor apărea aici după înregistrare.",
        equipment: "Echipament",
        equipmentPending: "Echipament în curs de clarificare",
        noMarking: "Fără marcaj suplimentar",
        ready: "Echipamentul este gata de ridicare.",
        open: "Deschide",
        pages: "Paginile istoricului",
        back: "Înapoi",
        page: "Pagina",
        of: "din",
        next: "Înainte",
        status: "Statut",
        receivedOn: "Data recepției",
        serial: "Număr de serie",
        warranty: "Garanție",
        notProvided: "Nu este indicat",
        openProduct: "Deschide produsul",
        reportedFault: "Defecțiunea declarată",
        noDescription: "Descrierea nu este indicată.",
        completedWork: "Lucrări efectuate",
        serviceResult: "Rezultatul service-ului",
        warrantyUntil: "Garanție până la",
        serviceCenter: "Centru de service",
        statusHistory: "Istoricul statutelor",
        serviceCost: "Cost servicii",
        total: "Total",
        includingVat: "Inclusiv TVA",
        grossVatNote: "Suma din 1C include TVA.",
        completedOn: "Reparație finalizată",
        issuedOn: "Eliberat clientului",
        contract: "Contract",
        monthlyTitle: "Valoarea totală pentru lună",
        servicesProvided: "Servicii prestate",
        monthlyTotal: "Valoarea totală",
        noCompletedServices: "Nu există servicii prestate în această lună.",
        previousMonth: "Luna precedentă",
        nextMonth: "Luna următoare",
        currencyPending: "Valuta unor documente este în curs de clarificare.",
      }
    : {
        empty: "История пока пуста",
        emptyHint:
          "Сервисные документы и заявки появятся здесь после регистрации.",
        equipment: "Оборудование",
        equipmentPending: "Оборудование уточняется",
        noMarking: "Без дополнительной маркировки",
        ready: "Оборудование готово к выдаче.",
        open: "Открыть",
        pages: "Страницы истории",
        back: "Назад",
        page: "Страница",
        of: "из",
        next: "Далее",
        status: "Статус",
        receivedOn: "Дата приёма",
        serial: "Серийный номер",
        warranty: "Гарантия",
        notProvided: "Не указан",
        openProduct: "Открыть товар",
        reportedFault: "Заявленная неисправность",
        noDescription: "Описание не указано.",
        completedWork: "Выполненные работы",
        serviceResult: "Результат обслуживания",
        warrantyUntil: "Гарантия до",
        serviceCenter: "Сервисный центр",
        statusHistory: "История статусов",
        serviceCost: "Стоимость услуг",
        total: "Итого",
        includingVat: "В т.ч. НДС",
        grossVatNote: "Сумма из 1С включает НДС.",
        completedOn: "Ремонт выполнен",
        issuedOn: "Выдано клиенту",
        contract: "Договор",
        monthlyTitle: "Общая стоимость за месяц",
        servicesProvided: "Оказано услуг",
        monthlyTotal: "Общая стоимость",
        noCompletedServices: "Оказанных услуг за этот месяц нет.",
        previousMonth: "Предыдущий месяц",
        nextMonth: "Следующий месяц",
        currencyPending: "Валюта части документов уточняется.",
      };
}

function analyticsCopy(locale: PartnerLocale) {
  return locale === "ro" ? {
    eyebrow: "Analiză servicii",
    title: "Dinamica și structura lucrărilor",
    description: "Date factuale din documentele de service finalizate. Valutele nu se însumează.",
    empty: "Nu există servicii prestate în perioada selectată.",
    comparedWithPrevious: "față de luna precedentă",
    completedCount: "Cazuri finalizate",
    average: "Cost mediu",
    countChange: "Diferență cazuri",
    amountChange: "Diferență valoare",
    trend: "Dinamica pe 12 luni",
    months: "luni",
    products: "Echipamente deservite frecvent",
    productsHint: "Clasament după numărul documentelor finalizate; nu reprezintă un indicator de fiabilitate.",
    noProducts: "Nu există date despre echipamente.",
    unknownProduct: "Echipament neidentificat",
    work: "Lucrări efectuate",
    workHint: "Grupare factuală după descrierea exactă din 1C, fără clasificare interpretativă.",
    noWork: "Descrierile lucrărilor nu sunt indicate.",
  } : {
    eyebrow: "Аналитика сервиса",
    title: "Динамика и структура работ",
    description: "Фактические данные завершённых сервисных документов. Валюты не суммируются.",
    empty: "За выбранный период оказанных сервисных услуг нет.",
    comparedWithPrevious: "к предыдущему месяцу",
    completedCount: "Завершено случаев",
    average: "Средняя стоимость",
    countChange: "Изменение количества",
    amountChange: "Изменение суммы",
    trend: "Динамика за 12 месяцев",
    months: "месяцев",
    products: "Часто обслуживаемое оборудование",
    productsHint: "Рейтинг по числу завершённых документов; не является показателем надёжности.",
    noProducts: "Данные об оборудовании отсутствуют.",
    unknownProduct: "Оборудование не определено",
    work: "Выполненные работы",
    workHint: "Фактическая группировка по точному описанию из 1С без интерпретации категорий.",
    noWork: "Описание выполненных работ не указано.",
  };
}
