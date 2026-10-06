import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  PackageCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import { ProductCard } from "../../catalog/components/ProductCard";
import type { WorkspaceHomeDto } from "../services";
import { DashboardTrackedLink } from "./DashboardTrackedLink";
import { DashboardOverviewCards } from "./DashboardOverviewCards";
import { OpportunityCard } from "../../commercial-opportunities/components/OpportunityCard";
import { SupportDashboardBlock } from "../../partner-support";
import { formatPartnerDate, formatPartnerMoney, partnerText, type PartnerLocale } from "../../partner-locale";
import { SalesTrendSummary } from "./SalesTrendSummary";
import { FinancePeriodPanel } from "./FinancePeriodPanel";
import { RollingPeriodSelector, type RollingPeriod, type RollingPeriodState } from "../../commerce-period";
import styles from "./OperationalDashboard.module.css";
import { compactActionClassName } from "../../platform-ui/action-styles";

export function OperationalDashboard({
  locale,
  periods,
  workspace,
}: {
  locale: PartnerLocale;
  periods: { repeat: RollingPeriodState };
  workspace: WorkspaceHomeDto;
}) {
  return (
    <div className={`${styles.dashboard} space-y-5`} data-operational-dashboard>
      <RepeatPurchaseSection
        analyticsSurface="dashboard_reorder"
        eligibleCount={workspace.reorderProductTotalCount}
        locale={locale}
        periods={periods}
        products={workspace.reorderProducts}
        title={partnerText(locale, "dashboard.previouslyPurchased")}
        workspace={workspace}
      />
      <DiscoverySection locale={locale} products={workspace.discoveryProducts} workspace={workspace} />
      <div className="space-y-4" data-dashboard-section="priority-work">
        <DashboardOverviewCards locale={locale} workspace={workspace} />
        <SupportDashboardBlock items={workspace.supportTickets ?? []} locale={locale} />
      </div>
      <OpportunitySection locale={locale} opportunities={workspace.opportunities} workspace={workspace} />
      <div className="grid items-stretch gap-5 xl:grid-cols-2" data-dashboard-finance-sales>
        <FinanceSection guidance={workspace.financeGuidance} locale={locale} summary={workspace.financeSummary} />
        <SalesSection analytics={workspace.salesAnalytics} locale={locale} />
      </div>
      <SpecialOffersSection locale={locale} products={workspace.specialOfferProducts} workspace={workspace} />
      <div className="grid gap-5 xl:grid-cols-2" data-dashboard-section="fulfilment">
        <OrdersSection locale={locale} summary={workspace.orderSummary} />
        <ShipmentsSection locale={locale} summary={workspace.shipmentSummary} />
      </div>
    </div>
  );
}

function DiscoverySection({ locale, products = [], workspace }: {
  locale: PartnerLocale;
  products?: WorkspaceHomeDto["discoveryProducts"];
  workspace: WorkspaceHomeDto;
}) {
  if (!products.length) return null;
  return (
    <section aria-labelledby="dashboard-discovery" data-dashboard-section="discovery">
      <SectionHeading actionHref="/cabinet/catalog" actionLabel={partnerText(locale, "dashboard.openShowcase")} id="dashboard-discovery" title={partnerText(locale, "dashboard.forYou")} />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {products.slice(0, 6).map((item, index) => <div className={discoveryProductVisibilityClass(index)} data-dashboard-discovery-product={index + 1} key={item.product.id}><ProductCard analyticsEventName="dashboard_novotech_offer_opened" analyticsSurface="dashboard_discovery" capabilities={workspace.capabilities.productCard} commercialView={item.commercialView} contextBadge={item.primaryDiscoverySignal === "ARRIVAL" ? partnerText(locale, "dashboard.arrival") : undefined} locale={locale} product={item.product} /></div>)}
      </div>
    </section>
  );
}

function SpecialOffersSection({ locale, products = [], workspace }: {
  locale: PartnerLocale;
  products?: WorkspaceHomeDto["specialOfferProducts"];
  workspace: WorkspaceHomeDto;
}) {
  if (!products.length) return null;
  return (
    <section aria-labelledby="dashboard-special-offers" data-dashboard-section="special-offers">
      <SectionHeading actionHref="/cabinet/offers" actionLabel={partnerText(locale, "dashboard.allSpecialOffers")} id="dashboard-special-offers" title={partnerText(locale, "dashboard.specialOffers")} />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {products.slice(0, 5).map((item, index) => (
          <div className={specialOfferVisibilityClass(index)} data-dashboard-special-offer={index + 1} key={item.product.id}>
            <ProductCard
              analyticsEventName="dashboard_novotech_offer_opened"
              analyticsSurface="dashboard_offers"
              capabilities={workspace.capabilities.productCard}
              commercialView={item.commercialView}
              companyId={workspace.viewer?.companyId}
              contextBadge={partnerText(locale, "dashboard.specialOfferBadge")}
              contextBadgeVariant="SPECIAL_OFFER"
              locale={locale}
              product={item.product}
              userId={workspace.viewer?.userId}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function specialOfferVisibilityClass(index: number): string {
  if (index === 0) return "min-w-0";
  if (index === 1) return "hidden min-w-0 sm:block";
  if (index === 2) return "hidden min-w-0 lg:block";
  if (index === 3) return "hidden min-w-0 xl:block";
  return "hidden min-w-0 2xl:block";
}

export function discoveryProductVisibilityClass(index: number): string {
  if (index === 0) return "min-w-0";
  if (index === 1) return "hidden min-w-0 sm:block";
  if (index === 2) return "hidden min-w-0 lg:block";
  if (index < 4) return "hidden min-w-0 xl:block";
  return "hidden min-w-0 2xl:block";
}

function OpportunitySection({ locale, opportunities = [], workspace }: { locale: PartnerLocale; opportunities?: WorkspaceHomeDto["opportunities"]; workspace: WorkspaceHomeDto }) {
  if (!opportunities.length) return null;
  return <section aria-labelledby="dashboard-opportunities" data-dashboard-section="purchase-opportunities">
    <SectionHeading actionHref="/cabinet/opportunities" actionLabel={partnerText(locale, "dashboard.allOpportunities")} id="dashboard-opportunities" title={partnerText(locale, "dashboard.opportunities")} />
    <div className="mt-3 grid gap-3 xl:grid-cols-2">{opportunities.slice(0, 4).map((opportunity) => <OpportunityCard canAddToOrder={workspace.capabilities.productCard.canAddToOrder} canAddToSpecification={workspace.capabilities.productCard.canAddToSpecification} canManagePurchasingLists={workspace.capabilities.productCard.canManagePurchasingLists} companyId={workspace.viewer?.companyId} key={opportunity.id} locale={locale} opportunity={opportunity} userId={workspace.viewer?.userId} />)}</div>
  </section>;
}

function OrdersSection({
  locale,
  summary,
}: {
  locale: PartnerLocale;
  summary: WorkspaceHomeDto["orderSummary"];
}) {
  return (
    <section aria-labelledby="dashboard-orders" className="min-w-0">
      <SectionHeading
        actionHref="/cabinet/orders"
        actionLabel={partnerText(locale, "dashboard.allOrders")}
        id="dashboard-orders"
        title={partnerText(locale, "dashboard.orders")}
      />
      <dl className="mt-3 grid grid-cols-2 gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-4">
        <Metric icon="clock" label={partnerText(locale, "dashboard.active")} value={summary.active} />
        <Metric icon="confirmed" label={partnerText(locale, "dashboard.confirmed")} value={summary.confirmed} />
        <Metric icon="clock" label={partnerText(locale, "dashboard.needsAttention")} value={summary.attention} />
        <Metric icon="clock" label={partnerText(locale, "dashboard.processing")} value={summary.portalProcessing} />
      </dl>
      {summary.recent.length ? (
        <ul className="divide-y divide-zinc-200 border-x border-b border-zinc-200 bg-white">
          {summary.recent.map((order) => (
            <li className="p-4" key={order.id}>
              <DashboardTrackedLink
                className="grid min-h-11 gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-emerald-500 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                eventName="dashboard_order_opened"
                href={order.href}
                sourceSurface="dashboard_orders"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-zinc-950">
                    {order.number}
                  </span>
                  {order.isTest ? <span className="ml-2 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">{partnerText(locale, "dashboard.test")}</span> : null}
                  <span className="mt-1 block text-xs text-zinc-500">
                    {partnerText(locale, "dashboard.orderDate")}: {formatDate(order.date, locale)} · {order.positionCount} {partnerText(locale, "dashboard.positionsShort")}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-600">{partnerText(locale, "dashboard.plannedShipment")}: {order.plannedDate ? formatDate(order.plannedDate, locale) : partnerText(locale, "dashboard.datePending")}</span>
                </span>
                <span className="min-w-0 text-xs font-semibold text-zinc-600 sm:text-right">
                  {order.statusLabel}
                  {order.formattedTotal ? (
                    <span className="mt-1 block text-zinc-950">
                      {order.formattedTotal}
                    </span>
                  ) : null}
                  <span className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-700">{partnerText(locale, "dashboard.details")}<ArrowRight aria-hidden="true" className="size-4" /></span>
                </span>
              </DashboardTrackedLink>
            </li>
          ))}
        </ul>
      ) : (
        <CompactEmpty
          actionHref="/cabinet/catalog"
          actionLabel={partnerText(locale, "dashboard.goCatalog")}
          message={partnerText(locale, "dashboard.noOrders")}
        />
      )}
    </section>
  );
}

function ShipmentsSection({
  locale,
  summary,
}: {
  locale: PartnerLocale;
  summary: WorkspaceHomeDto["shipmentSummary"];
}) {
  return (
    <section aria-labelledby="dashboard-shipments" className="min-w-0">
      <SectionHeading
        actionHref="/cabinet/reservation-requests"
        actionLabel={partnerText(locale, "dashboard.allShipments")}
        id="dashboard-shipments"
        title={partnerText(locale, "dashboard.shipments")}
      />
      <dl className="mt-3 grid grid-cols-2 gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-4">
        <Metric icon="calendar" label={partnerText(locale, "dashboard.overdue")} value={summary.overdue} />
        <Metric icon="calendar" label={partnerText(locale, "dashboard.today")} value={summary.today} />
        <Metric icon="calendar" label={partnerText(locale, "dashboard.threeDays")} value={summary.nextThreeDays} />
        <Metric icon="calendar" label={partnerText(locale, "dashboard.later")} value={summary.later} />
      </dl>
      {summary.items.length ? (
        <ul className="divide-y divide-zinc-200 border-x border-b border-zinc-200 bg-white">
          {summary.items.map((shipment) => (
            <li className="p-4" key={shipment.id}>
              <DashboardTrackedLink
                className="grid min-h-11 gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-emerald-500 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                eventName="dashboard_shipment_opened"
                href={shipment.href}
                sourceSurface="dashboard_shipments"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-zinc-950">
                    {shipment.orderNumber}
                  </span>
                  {shipment.isTest ? <span className="ml-2 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">{partnerText(locale, "dashboard.test")}</span> : null}
                  <span className="mt-1 block text-xs font-medium text-zinc-700">{shipment.statusLabel}</span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {shipment.positionCount} {partnerText(locale, "dashboard.positionsShort")} · {shipment.totalUnits} {partnerText(locale, "dashboard.unitsShort")}
                    {shipment.pendingDateChange ? ` · ${partnerText(locale, "dashboard.dateChangePending")}` : ""}
                  </span>
                </span>
                <span className="min-w-0 sm:text-right">
                  <span className="block text-xs text-zinc-500">{partnerText(locale, "dashboard.plannedDate")}</span>
                  <span className="block text-sm font-semibold text-zinc-950">
                    {formatDate(shipment.plannedDate, locale)}
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">{partnerText(locale, "dashboard.details")}<ArrowRight aria-hidden="true" className="size-4" /></span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {shipmentDistance(shipment.plannedDate, locale)}
                  </span>
                </span>
              </DashboardTrackedLink>
            </li>
          ))}
        </ul>
      ) : (
        <CompactEmpty message={partnerText(locale, "dashboard.noShipments")} />
      )}
    </section>
  );
}

function RepeatPurchaseSection({
  analyticsSurface,
  eligibleCount,
  locale,
  periods,
  products,
  title,
  workspace,
}: {
  analyticsSurface: string;
  eligibleCount: number;
  locale: PartnerLocale;
  periods: { repeat: RollingPeriodState };
  products: WorkspaceHomeDto["reorderProducts"];
  title: string;
  workspace: WorkspaceHomeDto;
}) {
  if (!products.length) return null;
  return (
    <section aria-labelledby={`dashboard-${analyticsSurface}`} data-dashboard-section="repeat-purchase">
      <SectionHeading
        actionHref={selectionFullHref(periods.repeat)}
        actionLabel={partnerText(locale, "dashboard.openAll")}
        count={hiddenDashboardProductCount(eligibleCount, products.length)}
        id={`dashboard-${analyticsSurface}`}
        title={title}
        titleAccessory={<RollingPeriodSelector activePeriod={periods.repeat} hrefForPeriod={dashboardPeriodHref} locale={locale} />}
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {products.slice(0, 5).map((item) => (
          <ProductCard
              analyticsEventName={
                analyticsSurface === "dashboard_offers"
                  ? "dashboard_novotech_offer_opened"
                  : "dashboard_previous_purchase_opened"
              }
              analyticsSurface={analyticsSurface}
              cartSuccessEventName={
                analyticsSurface === "dashboard_reorder"
                  ? "dashboard_reorder_product_added"
                  : undefined
              }
              capabilities={workspace.capabilities.productCard}
              commercialView={item.commercialView}
              locale={locale}
              product={item.product}
              key={item.product.id}
          />
        ))}
      </div>
    </section>
  );
}

function dashboardPeriodHref(target: RollingPeriod): string {
  return `/cabinet?period=${target}`;
}

function selectionFullHref(state: RollingPeriodState): string {
  return state ? `/cabinet/repeat-purchase?period=${state}` : "/cabinet/repeat-purchase";
}

function FinanceSection({
  guidance,
  locale,
  summary,
}: {
  guidance: WorkspaceHomeDto["financeGuidance"];
  locale: PartnerLocale;
  summary: WorkspaceHomeDto["financeSummary"];
}) {
  if (!summary && !guidance) return null;
  return (
    <section aria-labelledby="dashboard-finance" className="flex h-full min-w-0 flex-col" data-dashboard-section="finance">
      <SectionHeading
        actionHref="/cabinet/finance"
        actionLabel={partnerText(locale, "dashboard.openFinance")}
        id="dashboard-finance"
        title={partnerText(locale, "dashboard.finance")}
      />
      <div className="mt-3 flex-1 border border-zinc-200 bg-white p-3" data-analytics-card data-finance-panel>
        {guidance ? <FinancePeriodPanel guidance={guidance} locale={locale} synchronizedAt={summary?.lastSuccessfulAt ?? null} /> : summary ?
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.totals.map((total) => (
            <div className="bg-zinc-50 p-3" key={total.currency}>
              <p className="text-xs font-semibold text-zinc-500">
                {total.currency}
              </p>
              <p className="mt-2 text-sm text-zinc-700">
                {partnerText(locale, "dashboard.amountDue")}:{" "}
                <strong className="text-zinc-950">
                  {formatAmount(total.receivable, total.currency, locale)}
                </strong>
              </p>
              <p className="mt-1 text-sm text-zinc-700">
                {partnerText(locale, "dashboard.advance")}:{" "}
                <strong className="text-zinc-950">
                  {formatAmount(total.advance, total.currency, locale)}
                </strong>
              </p>
            </div>
          ))}
          <div className="flex items-center gap-3 bg-zinc-50 p-3">
            <CircleDollarSign
              aria-hidden="true"
              className="size-6 text-emerald-700"
            />
            <div>
              <p className="text-xs text-zinc-500">{partnerText(locale, "dashboard.contractsWithBalance")}</p>
              <p className="font-semibold text-zinc-950">
                {summary.contractCount}
              </p>
            </div>
          </div>
        </div> : null}
      </div>
    </section>
  );
}

function SalesSection({
  analytics,
  locale,
}: {
  analytics: WorkspaceHomeDto["salesAnalytics"];
  locale: PartnerLocale;
}) {
  if (!analytics) return null;
  return (
    <section aria-labelledby="dashboard-sales" className="flex h-full min-w-0 flex-col" data-dashboard-section="sales">
      <SectionHeading
        actionHref="/cabinet/orders"
        actionLabel={partnerText(locale, "dashboard.openSales")}
        id="dashboard-sales"
        title={partnerText(locale, "dashboard.sales")}
      />
      <div className="mt-3 flex-1 border border-zinc-200 bg-white p-3" data-analytics-card data-sales-panel>
        {analytics.series.length ? (
          <>
            <div>
              <SalesTrendSummary locale={locale} series={analytics.series} />
            </div>
            <SalesLineCharts analytics={analytics} locale={locale} />
          </>
        ) : (
          <div className="mt-3 border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600" data-sales-empty>
            {partnerText(locale, "dashboard.salesEmpty")}
          </div>
        )}
      </div>
    </section>
  );
}

function SalesLineCharts({
  analytics,
  locale,
}: {
  analytics: NonNullable<WorkspaceHomeDto["salesAnalytics"]>;
  locale: PartnerLocale;
}) {
  return (
    <div className="mt-3 border-t border-zinc-200 pt-3" data-dashboard-chart-type="line">
      <div className="flex flex-wrap items-center justify-between gap-2" data-analytics-chart-header>
        <h3 className="text-sm font-semibold text-zinc-950">{partnerText(locale, "dashboard.salesDynamics")}</h3>
        <p className="text-xs text-zinc-600">{partnerText(locale, "dashboard.procurementSource")}</p>
      </div>
        <p className="mt-2 text-xs font-medium tabular-nums text-zinc-500" data-sales-context-period>
          {formatDate(analytics.periodStart, locale)} — {formatDate(analytics.periodEnd, locale)}
        </p>
      <div className="mt-2 space-y-3">
        {analytics.series.map((series) => (
          <div className="min-w-0 border border-zinc-200 bg-zinc-50/70" data-sales-line-chart={series.currency} key={series.currency}>
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-2 py-1 text-xs">
              <span className="font-semibold text-zinc-700">{series.currency}</span>
              <span className="tabular-nums text-zinc-500">{series.orderCount} · {formatAmount(series.total, series.currency, locale)}</span>
            </div>
            <p className="sr-only" id={`dashboard-procurement-summary-${series.currency}`}>{partnerText(locale, "dashboard.salesForPeriod")}: {formatAmount(series.total, series.currency, locale)} · {series.orderCount} {partnerText(locale, "dashboard.salesOrders")} · {formatDate(analytics.periodStart, locale)} — {formatDate(analytics.periodEnd, locale)}</p>
            <div className="relative h-20">
              <svg aria-describedby={`dashboard-procurement-summary-${series.currency}`} aria-label={`${partnerText(locale, "dashboard.salesDynamics")}: ${series.currency}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" role="img" viewBox="0 0 100 100">
                {[20, 55, 90].map((y) => <line key={y} stroke="rgb(228 228 231)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" x1="0" x2="100" y1={y} y2={y} />)}
                <polyline
                  fill="none"
                  points={series.points.map((point) => `${point.xPercent},${point.yPercent}`).join(" ")}
                  stroke="rgb(4 120 87)"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {series.points.map((point) => (
                <span
                  aria-hidden="true"
                  className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-700 bg-white"
                  data-sales-point={point.month}
                  key={point.month}
                  style={{ left: `${point.xPercent}%`, top: `${point.yPercent}%` }}
                  title={`${formatSalesMonth(point.month, locale)} · ${formatAmount(point.amount, series.currency, locale)} · ${point.orderCount}`}
                />
              ))}
            </div>
            <div aria-hidden="true" className="relative h-7 border-t border-zinc-200 bg-white" data-sales-axis>
              {series.points.filter((point) => point.showLabel).map((point) => (
                <span
                  className={`absolute top-1 whitespace-nowrap text-[10px] font-medium text-zinc-500 ${point.showLabelOnMobile ? "" : "hidden sm:block"} ${point.labelAlign === "start" ? "" : point.labelAlign === "end" ? "-translate-x-full" : "-translate-x-1/2"}`}
                  data-sales-month={point.month}
                  key={point.month}
                  style={{ left: `${point.xPercent}%` }}
                >
                  {formatSalesMonth(point.month, locale)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSalesMonth(value: string, locale: PartnerLocale) {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "ru-RU", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`)).replaceAll(".", "");
}

function SectionHeading({
  actionHref,
  actionLabel,
  count,
  id,
  title,
  titleAccessory,
}: {
  actionHref?: string;
  actionLabel?: string;
  count?: number;
  id: string;
  title: string;
  titleAccessory?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3" data-dashboard-section-heading>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3"><h2 className="text-lg font-semibold text-zinc-950" id={id}>{title}</h2>{titleAccessory}</div>
      {actionHref && actionLabel ? (
        <DashboardTrackedLink
          className={`${compactActionClassName.textLink} shrink-0`}
          dataActionLevel="text-link"
          eventName={sectionEvent(id)}
          href={actionHref}
          sourceSurface={id}
        >
          {count && count > 0 ? <span aria-label={`${count}`} className="inline-flex size-5 min-w-5 items-center justify-center rounded bg-emerald-700 px-1 text-[11px] font-bold tabular-nums text-white" data-dashboard-hidden-count>{count}</span> : null}
          {actionLabel}
          <ArrowRight aria-hidden="true" className="size-4" />
        </DashboardTrackedLink>
      ) : null}
    </div>
  );
}

export function hiddenDashboardProductCount(totalEligible: number, displayed: number): number {
  return Math.max(0, Math.floor(totalEligible) - Math.max(0, Math.floor(displayed)));
}

function Metric({ icon, label, value }: { icon: "calendar" | "clock" | "confirmed"; label: string; value: number }) {
  return (
    <div className="flex min-h-20 items-center gap-3 bg-white p-3">
      {metricIcon(icon)}
      <div>
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className="mt-1 text-xl font-semibold text-zinc-950">{value}</dd>
      </div>
    </div>
  );
}

function CompactEmpty({
  actionHref,
  actionLabel,
  message,
}: {
  actionHref?: string;
  actionLabel?: string;
  message: string;
}) {
  return (
    <div className="border-x border-b border-zinc-200 bg-white p-4 text-sm text-zinc-600">
      <p>{message}</p>
      {actionHref && actionLabel ? (
        <DashboardTrackedLink
          className={`${compactActionClassName.secondary} mt-3`}
          dataActionLevel="secondary"
          eventName="dashboard_quick_action_clicked"
          href={actionHref}
          sourceSurface="dashboard_empty_state"
        >
          {actionLabel}
        </DashboardTrackedLink>
      ) : null}
    </div>
  );
}

function sectionEvent(id: string) {
  if (id.includes("finance")) return "dashboard_finance_opened" as const;
  if (id.includes("company")) return "dashboard_company_opened" as const;
  if (id.includes("shipment")) return "dashboard_shipment_opened" as const;
  if (id.includes("order")) return "dashboard_order_opened" as const;
  return "dashboard_quick_action_clicked" as const;
}

function metricIcon(icon: "calendar" | "clock" | "confirmed") {
  const className = "size-5 shrink-0 text-emerald-700";
  if (icon === "calendar") {
    return <CalendarClock aria-hidden="true" className={className} />;
  }
  if (icon === "confirmed") {
    return <PackageCheck aria-hidden="true" className={className} />;
  }
  return <Clock3 aria-hidden="true" className={className} />;
}

function shipmentDistance(value: string, locale: PartnerLocale): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const today = new Date();
  const current = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const days = Math.round((date.getTime() - current) / 86_400_000);
  if (days < 0) return interpolate(partnerText(locale, "dashboard.daysAgo"), Math.abs(days));
  if (days === 0) return partnerText(locale, "dashboard.today").toLocaleLowerCase();
  return interpolate(partnerText(locale, "dashboard.inDays"), days);
}

function formatDate(value: string, locale: PartnerLocale): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? formatPartnerDate(date, locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : partnerText(locale, "dashboard.datePending");
}

function formatAmount(amount: number, currency: string, locale: PartnerLocale): string {
  return formatPartnerMoney(amount, currency, locale);
}

function interpolate(template: string, count: number): string {
  return template.replace("{count}", String(count));
}
