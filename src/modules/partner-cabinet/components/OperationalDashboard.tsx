import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  X,
} from "lucide-react";

import { ProductCard } from "../../catalog/components/ProductCard";
import { DashboardPurchaseTemplateButton } from "../../purchase-templates/components/DashboardPurchaseTemplateButton";
import type { WorkspaceHomeDto } from "../services";
import { DashboardTrackedLink } from "./DashboardTrackedLink";
import { OpportunityCard } from "../../commercial-opportunities/components/OpportunityCard";
import { CampaignCard } from "../../commercial-campaigns/components/CampaignCard";
import { dismissDashboardAttentionAction } from "../actions";
import { SupportDashboardBlock } from "../../partner-support";
import { formatPartnerDate, formatPartnerMoney, formatPartnerRelativeDate, partnerText, presentDashboardAttention, type PartnerLocale } from "../../partner-locale";

export function OperationalDashboard({
  locale,
  workspace,
}: {
  locale: PartnerLocale;
  workspace: WorkspaceHomeDto;
}) {
  return (
    <div className="app-section-stack">
      <AttentionSection items={workspace.attentionItems} locale={locale} />
      <EstimateSalesSection items={workspace.estimateSalesOpportunities} locale={locale} />
      <SupportDashboardBlock items={workspace.supportTickets ?? []} locale={locale} />
      <div className="grid gap-5 xl:grid-cols-2">
        <OrdersSection locale={locale} summary={workspace.orderSummary} />
        <ShipmentsSection locale={locale} summary={workspace.shipmentSummary} />
      </div>
      <ProductSection
        analyticsSurface="dashboard_reorder"
        locale={locale}
        products={workspace.reorderProducts}
        title={partnerText(locale, "dashboard.previouslyPurchased")}
        workspace={workspace}
      />
      <FinanceSection locale={locale} summary={workspace.financeSummary} />
      <OpportunitySection locale={locale} opportunities={workspace.opportunities} workspace={workspace} />
      <NovotechOffersSection
        campaigns={workspace.campaigns}
        locale={locale}
        products={workspace.merchandisingProducts}
        workspace={workspace}
      />
    </div>
  );
}

export function EstimateSalesSection({ items = [], locale }: { items: WorkspaceHomeDto["estimateSalesOpportunities"]; locale: PartnerLocale }) {
  if (!items.length) return null;
  return <section aria-labelledby="dashboard-estimate-sales">
    <SectionHeading actionHref="/cabinet/estimates" actionLabel={partnerText(locale, "dashboard.allEstimates")} id="dashboard-estimate-sales" title={partnerText(locale, "dashboard.salesOpportunities")} />
    <ul className="mt-3 divide-y divide-zinc-200 border border-zinc-200 bg-white">
      {items.map((item) => <li className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={item.id}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><p className="font-semibold text-zinc-950">{item.customerName || item.proposalName}</p><span className="text-xs text-zinc-500">{item.estimateNumber}</span></div>
          <p className="mt-1 text-sm font-medium text-emerald-800">{partnerText(locale, opportunityStateKey(item))}{item.type === "awaiting_customer" ? ` · ${partnerText(locale, opportunityDateKey(item.type))} ${formatPartnerRelativeDate(item.waitingSince, locale)}` : ""}</p>
          <p className="mt-1 text-xs text-zinc-500">{formatPartnerMoney(item.amount, item.currency, locale)} · {item.projectName || item.proposalName}{opportunitySecondaryContext(item, locale)}</p>
        </div>
        <DashboardTrackedLink className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500" eventName="dashboard_continue_work_clicked" href={item.href} metadataSafe={{ opportunityType: item.type }} sourceSurface="dashboard_estimate_sales">
          {partnerText(locale, opportunityActionKey(item.action))}<ArrowRight aria-hidden="true" className="size-4" />
        </DashboardTrackedLink>
      </li>)}
    </ul>
  </section>;
}

type EstimateSalesOpportunityType = NonNullable<WorkspaceHomeDto["estimateSalesOpportunities"]>[number]["type"];

function opportunityStateKey(item: NonNullable<WorkspaceHomeDto["estimateSalesOpportunities"]>[number]) {
  if (item.followUpState === "expired_sent") return "dashboard.proposalExpired" as const;
  if (item.followUpState === "sent_opened_no_response") return "dashboard.proposalOpened" as const;
  if (item.followUpState === "sent_not_opened") return "dashboard.proposalNotOpened" as const;
  if (item.type === "resume_checkout") return "dashboard.proposalInCart" as const;
  if (item.type === "accepted_ready_to_order") return "dashboard.proposalAccepted" as const;
  return item.type === "ready_to_send" ? "dashboard.proposalReadyToSend" as const : "dashboard.awaitingCustomer" as const;
}

function opportunityDateKey(type: EstimateSalesOpportunityType) {
  if (type === "resume_checkout" || type === "accepted_ready_to_order") return "dashboard.accepted" as const;
  return type === "awaiting_customer" ? "dashboard.sent" as const : "dashboard.prepared" as const;
}

function opportunitySecondaryContext(item: NonNullable<WorkspaceHomeDto["estimateSalesOpportunities"]>[number], locale: PartnerLocale): string {
  if (item.type !== "awaiting_customer") return ` · ${partnerText(locale, opportunityDateKey(item.type))} ${formatPartnerRelativeDate(item.waitingSince, locale)}`;
  if (item.validUntil && item.followUpState !== "expired_sent") return ` · ${partnerText(locale, "dashboard.proposalValidUntil")} ${formatDate(item.validUntil, locale)}`;
  return "";
}

function opportunityActionKey(action: NonNullable<WorkspaceHomeDto["estimateSalesOpportunities"]>[number]["action"]) {
  if (action === "resume_checkout") return "dashboard.resumeCheckout" as const;
  if (action === "continue_order") return "dashboard.continueOrder" as const;
  if (action === "resend") return "dashboard.sendAgain" as const;
  if (action === "update") return "dashboard.updateProposal" as const;
  return action === "open_and_send" ? "dashboard.openAndSend" as const : "dashboard.returnToProposal" as const;
}

function NovotechOffersSection({ campaigns = [], locale, products = [], workspace }: {
  campaigns?: WorkspaceHomeDto["campaigns"];
  locale: PartnerLocale;
  products?: WorkspaceHomeDto["merchandisingProducts"];
  workspace: WorkspaceHomeDto;
}) {
  if (!campaigns.length && !products.length) return null;
  return (
    <section aria-labelledby="dashboard-novotech-offers">
      <SectionHeading actionHref="/cabinet/offers" actionLabel={partnerText(locale, "dashboard.allOffers")} id="dashboard-novotech-offers" title={partnerText(locale, "dashboard.novotechOffers")} />
      {campaigns.length ? <div className="mt-3 grid gap-3 xl:grid-cols-2">{campaigns.slice(0, 2).map((campaign) => <CampaignCard campaign={campaign} key={campaign.id} locale={locale} />)}</div> : null}
      {products.length ? <div className="app-product-grid mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{products.slice(0, 5).map((item) => <ProductCard analyticsEventName="dashboard_novotech_offer_opened" analyticsSurface="dashboard_offers" capabilities={workspace.capabilities.productCard} commercialView={item.commercialView} key={item.product.id} locale={locale} product={item.product} />)}</div> : null}
    </section>
  );
}

function OpportunitySection({ locale, opportunities = [], workspace }: { locale: PartnerLocale; opportunities?: WorkspaceHomeDto["opportunities"]; workspace: WorkspaceHomeDto }) {
  if (!opportunities.length) return null;
  return <section aria-labelledby="dashboard-opportunities">
    <SectionHeading actionHref="/cabinet/opportunities" actionLabel={partnerText(locale, "dashboard.allOpportunities")} id="dashboard-opportunities" title={partnerText(locale, "dashboard.opportunities")} />
    <div className="mt-3 grid gap-3 xl:grid-cols-2 min-[2560px]:grid-cols-4">{opportunities.slice(0, 4).map((opportunity) => <OpportunityCard canAddToOrder={workspace.capabilities.productCard.canAddToOrder} canAddToSpecification={workspace.capabilities.productCard.canAddToSpecification} canManagePurchasingLists={workspace.capabilities.productCard.canManagePurchasingLists} key={opportunity.id} locale={locale} opportunity={opportunity} />)}</div>
  </section>;
}

function AttentionSection({
  items,
  locale,
}: {
  items: WorkspaceHomeDto["attentionItems"];
  locale: PartnerLocale;
}) {
  return (
    <section aria-labelledby="dashboard-attention">
      <SectionHeading id="dashboard-attention" title={partnerText(locale, "dashboard.attention")} />
      {items.length ? (
        <ul className="mt-3 divide-y divide-zinc-200 border border-zinc-200 bg-white">
          {items.map((item) => {
            const presentation = presentDashboardAttention(item, locale);
            return (
            <li
              className="grid gap-3 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center"
              key={`${item.kind}:${item.id}`}
            >
              <span className="flex size-10 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                <AlertTriangle aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                {item.isTest ? (
                  <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                    <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">{partnerText(locale, "dashboard.test")}</span>
                    {item.orderNumber ? <span>{item.orderNumber}</span> : null}
                    {item.plannedDate ? <span>{partnerText(locale, "dashboard.until")} {formatDate(item.plannedDate, locale)}</span> : null}
                  </p>
                ) : null}
                <p className="font-semibold text-zinc-950">{presentation.title}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {presentation.consequence}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {relativeDate(item.occurredAt, locale)}
                </p>
              </div>
              <DashboardTrackedLink
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
                eventName="dashboard_attention_opened"
                href={item.href}
                metadataSafe={{ kind: item.kind }}
                sourceSurface="dashboard_attention"
              >
                {presentation.ctaLabel}
                <ArrowRight aria-hidden="true" className="size-4" />
              </DashboardTrackedLink>
              <form action={dismissDashboardAttentionAction}>
                <input name="itemId" type="hidden" value={item.id} />
                <input name="sourceFingerprint" type="hidden" value={item.sourceFingerprint} />
                <button aria-label={partnerText(locale, "dashboard.hideMessage")} className="inline-flex size-11 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" title={partnerText(locale, "dashboard.hideMessage")} type="submit">
                  <X aria-hidden="true" className="size-4" />
                </button>
              </form>
            </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 flex items-center gap-3 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
          {partnerText(locale, "dashboard.allWell")}
        </div>
      )}
    </section>
  );
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
                className="flex min-h-11 items-start justify-between gap-3 rounded-sm focus-visible:ring-2 focus-visible:ring-emerald-500"
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
                    {formatDate(order.date, locale)} · {order.positionCount} {partnerText(locale, "dashboard.positionsShort")}
                    {order.plannedDate
                      ? ` · ${partnerText(locale, "dashboard.shipment")} ${formatDate(order.plannedDate, locale)}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs font-semibold text-zinc-600">
                  {order.statusLabel}
                  {order.formattedTotal ? (
                    <span className="mt-1 block text-zinc-950">
                      {order.formattedTotal}
                    </span>
                  ) : null}
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
                className="flex min-h-11 items-start justify-between gap-3 rounded-sm focus-visible:ring-2 focus-visible:ring-emerald-500"
                eventName="dashboard_shipment_opened"
                href={shipment.href}
                sourceSurface="dashboard_shipments"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-zinc-950">
                    {shipment.orderNumber}
                  </span>
                  {shipment.isTest ? <span className="ml-2 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">{partnerText(locale, "dashboard.test")}</span> : null}
                  <span className="mt-1 block text-xs text-zinc-500">
                    {shipment.positionCount} {partnerText(locale, "dashboard.positionsShort")} · {shipment.totalUnits} {partnerText(locale, "dashboard.unitsShort")}
                    {shipment.pendingDateChange ? ` · ${partnerText(locale, "dashboard.dateChangePending")}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold text-zinc-950">
                    {formatDate(shipment.plannedDate, locale)}
                  </span>
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

function ProductSection({
  analyticsSurface,
  locale,
  products,
  title,
  workspace,
}: {
  analyticsSurface: string;
  locale: PartnerLocale;
  products: WorkspaceHomeDto["reorderProducts"];
  title: string;
  workspace: WorkspaceHomeDto;
}) {
  if (!products.length) return null;
  return (
    <section aria-label={title}>
      <SectionHeading
        actionHref="/cabinet/catalog"
        actionLabel={partnerText(locale, "dashboard.openCatalog")}
        id={`dashboard-${analyticsSurface}`}
        title={title}
      />
      <div className="app-product-grid mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
      {analyticsSurface === "dashboard_reorder" ? <DashboardPurchaseTemplateButton items={products.slice(0, 5).map((item) => ({ productId: item.product.id, quantity: Math.max(1, Math.trunc(item.typicalQuantity ?? 1)) }))} /> : null}
    </section>
  );
}

function FinanceSection({
  locale,
  summary,
}: {
  locale: PartnerLocale;
  summary: WorkspaceHomeDto["financeSummary"];
}) {
  if (!summary) return null;
  return (
    <section aria-labelledby="dashboard-finance">
      <SectionHeading
        actionHref="/cabinet/finance"
        actionLabel={partnerText(locale, "dashboard.openFinance")}
        id="dashboard-finance"
        title={partnerText(locale, "dashboard.finance")}
      />
      <div className="mt-3 border border-zinc-200 bg-white p-4">
        {summary.lastSuccessfulAt ? <p className="mb-3 text-xs text-zinc-500">{partnerText(locale, "dashboard.updated")}: {formatDate(summary.lastSuccessfulAt, locale)}</p> : null}
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
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  actionHref,
  actionLabel,
  id,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  id: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-zinc-950" id={id}>
        {title}
      </h2>
      {actionHref && actionLabel ? (
        <DashboardTrackedLink
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
          eventName={sectionEvent(id)}
          href={actionHref}
          sourceSurface={id}
        >
          {actionLabel}
          <ArrowRight aria-hidden="true" className="size-4" />
        </DashboardTrackedLink>
      ) : null}
    </div>
  );
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
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-emerald-700"
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

function relativeDate(value: string, locale: PartnerLocale): string {
  return formatPartnerRelativeDate(value, locale) || partnerText(locale, "dashboard.datePending");
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
