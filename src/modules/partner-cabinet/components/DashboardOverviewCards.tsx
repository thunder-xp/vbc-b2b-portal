import { ArrowRight } from "lucide-react";

import { formatPartnerDate, formatPartnerMoney, partnerText, presentDashboardAttention, type PartnerLocale } from "../../partner-locale";
import type { WorkspaceHomeDto } from "../services";
import { DashboardTrackedLink } from "./DashboardTrackedLink";

type OverviewAction = Pick<Parameters<typeof DashboardTrackedLink>[0], "href" | "eventName" | "metadataSafe" | "sourceSurface"> & { label: string };

export function DashboardOverviewCards({ locale, workspace }: { locale: PartnerLocale; workspace: WorkspaceHomeDto }) {
  const navigation = workspace.capabilities.navigation.filter((item) => item.availability === "available");
  const ordersHref = navigation.find((item) => item.key === "orders")?.href;
  const financeHref = navigation.find((item) => item.key === "finance")?.href;
  const proposalsHref = navigation.find((item) => item.key === "proposals")?.href;
  const attention = workspace.attentionItems[0];
  const attentionPresentation = attention ? presentDashboardAttention(attention, locale) : null;
  const opportunity = workspace.estimateSalesOpportunities?.[0];
  const shipment = ordersHref ? workspace.shipmentSummary.items[0] : null;
  const guidance = financeHref ? workspace.financeGuidance : null;
  const financeTotal = guidance?.state === "unavailable" ? null : guidance?.state === "overdue"
    ? guidance.totals.find((total) => total.overdue > 0) ?? guidance.totals[0]
    : guidance?.totals[0];
  const fallbackTotal = financeHref && !guidance ? workspace.financeSummary?.totals[0] : null;
  const financeValue = !financeHref ? partnerText(locale, "dashboard.overviewUnavailable")
    : guidance?.state === "unavailable" ? partnerText(locale, "dashboard.overviewStale")
    : financeTotal ? formatPartnerMoney(guidance?.state === "overdue" ? financeTotal.overdue : financeTotal.outstanding, financeTotal.currency, locale)
    : fallbackTotal ? formatPartnerMoney(fallbackTotal.receivable, fallbackTotal.currency, locale)
    : guidance?.state === "healthy" ? partnerText(locale, "dashboard.financeState.healthy")
    : partnerText(locale, "common.noData");

  return <div className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" data-dashboard-overview>
    <OverviewCard
      action={attention && attentionPresentation ? { href: attention.href, label: attentionPresentation.ctaLabel, eventName: "dashboard_attention_opened", metadataSafe: { kind: attention.kind }, sourceSurface: "dashboard_attention" } : ordersHref ? { href: ordersHref, label: partnerText(locale, "dashboard.openSales"), eventName: "dashboard_attention_opened", sourceSurface: "dashboard_attention" } : null}
      id="attention"
      locale={locale}
      primary={String(workspace.attentionItems.length)}
      secondary={attention ? attention.orderNumber || attentionPresentation?.title : partnerText(locale, "dashboard.overviewNoTasks")}
      title={partnerText(locale, "dashboard.attention")}
    />
    <OverviewCard
      action={opportunity ? { href: opportunity.href, label: partnerText(locale, opportunityActionKey(opportunity.action)), eventName: "dashboard_continue_work_clicked", metadataSafe: { opportunityType: opportunity.type }, sourceSurface: "dashboard_estimate_sales" } : proposalsHref ? { href: proposalsHref, label: partnerText(locale, "dashboard.allEstimates"), eventName: "dashboard_continue_work_clicked", sourceSurface: "dashboard_estimate_sales" } : null}
      id="sales"
      locale={locale}
      primary={opportunity ? partnerText(locale, opportunityStateKey(opportunity)) : partnerText(locale, proposalsHref ? "dashboard.overviewNoOpportunities" : "dashboard.overviewUnavailable")}
      secondary={opportunity?.estimateNumber}
      title={partnerText(locale, "dashboard.salesOpportunities")}
    />
    <OverviewCard
      action={financeHref ? { href: financeHref, label: partnerText(locale, "dashboard.openFinance"), eventName: "dashboard_finance_opened", sourceSurface: "dashboard_summary" } : null}
      id="finance"
      locale={locale}
      primary={financeValue}
      secondary={financeTotal || fallbackTotal ? partnerText(locale, guidance?.state === "overdue" ? "dashboard.financeOverdue" : "dashboard.amountDue") : undefined}
      title={partnerText(locale, "dashboard.finance")}
    />
    <OverviewCard
      action={ordersHref ? { href: ordersHref, label: partnerText(locale, "dashboard.openSales"), eventName: "dashboard_order_opened", sourceSurface: "dashboard_summary" } : null}
      id="orders"
      locale={locale}
      primary={ordersHref ? String(workspace.orderSummary.active) : partnerText(locale, "dashboard.overviewUnavailable")}
      secondary={ordersHref ? partnerText(locale, "dashboard.active") : undefined}
      title={partnerText(locale, "dashboard.currentOrders")}
    />
    <OverviewCard
      action={ordersHref ? { href: shipment?.href ?? ordersHref, label: partnerText(locale, shipment ? "dashboard.details" : "dashboard.openSales"), eventName: "dashboard_shipment_opened", sourceSurface: "dashboard_summary" } : null}
      id="shipment"
      locale={locale}
      primary={shipment ? formatPartnerDate(shipment.plannedDate, locale) : partnerText(locale, ordersHref ? "dashboard.notScheduled" : "dashboard.overviewUnavailable")}
      secondary={shipment ? `${partnerText(locale, "dashboard.plannedDate")} · ${shipment.orderNumber}` : undefined}
      title={partnerText(locale, "dashboard.nearestShipment")}
    />
  </div>;
}

function OverviewCard({ action, id, locale, primary, secondary, title }: {
  action: OverviewAction | null;
  id: string;
  locale: PartnerLocale;
  primary: string;
  secondary?: string | null;
  title: string;
}) {
  const actionClassName = "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded text-xs font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";
  return <section aria-labelledby={`dashboard-overview-${id}`} className="flex h-full min-h-44 min-w-0 flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3" data-dashboard-overview-card={id}>
    <h2 className="text-xs font-semibold leading-4 text-zinc-600" id={`dashboard-overview-${id}`}>{title}</h2>
    <p className="min-h-12 break-words text-lg font-semibold leading-6 tabular-nums text-zinc-950" data-overview-primary>{primary}</p>
    {secondary ? <p className="truncate text-xs leading-4 text-zinc-500" data-overview-secondary title={secondary}>{secondary}</p> : null}
    <div className="mt-auto">
      {action ? <DashboardTrackedLink className={actionClassName} eventName={action.eventName} href={action.href} metadataSafe={action.metadataSafe} sourceSurface={action.sourceSurface}><span>{action.label}</span><ArrowRight aria-hidden="true" className="size-3.5 shrink-0" /></DashboardTrackedLink> : <button className="min-h-8 text-xs font-medium text-zinc-400" disabled type="button">{partnerText(locale, "dashboard.details")}</button>}
    </div>
  </section>;
}

function opportunityStateKey(item: NonNullable<WorkspaceHomeDto["estimateSalesOpportunities"]>[number]) {
  if (item.followUpState === "expired_sent") return "dashboard.proposalExpired" as const;
  if (item.followUpState === "sent_opened_no_response") return "dashboard.proposalOpened" as const;
  if (item.followUpState === "sent_not_opened") return "dashboard.proposalNotOpened" as const;
  if (item.type === "resume_checkout") return "dashboard.proposalInCart" as const;
  if (item.type === "accepted_ready_to_order") return "dashboard.proposalAccepted" as const;
  return item.type === "ready_to_send" ? "dashboard.proposalReadyToSend" as const : "dashboard.awaitingCustomer" as const;
}

function opportunityActionKey(action: NonNullable<WorkspaceHomeDto["estimateSalesOpportunities"]>[number]["action"]) {
  if (action === "resume_checkout") return "dashboard.resumeCheckout" as const;
  if (action === "continue_order") return "dashboard.continueOrder" as const;
  if (action === "resend") return "dashboard.sendAgain" as const;
  if (action === "update") return "dashboard.updateProposal" as const;
  return action === "open_and_send" ? "dashboard.openAndSend" as const : "dashboard.returnToProposal" as const;
}
