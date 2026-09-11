import type { CatalogProductCardDto } from "../../catalog/services";
import type { ProductReferenceService } from "../../catalog/services";
import type { ProductReferenceDto } from "../../catalog/types";
import { InvalidStateError } from "../../access-control/services";
import { evaluateFreshness, type FreshnessView } from "../../integration/freshness";
import type {
  PricingInventoryService,
  ProductCommercialViewDto,
} from "../../pricing-inventory";
import type { CommercialFreshnessReadModel } from "../repositories/commercial-freshness.repository";
import type {
  WorkspaceDashboardProductCandidate,
  WorkspaceDashboardProjection,
  WorkspaceDashboardRepository,
} from "../repositories/workspace-dashboard.repository";
import type { WorkspaceNavigationItem } from "./workspace-capability.service";
import type {
  NotificationRepository,
} from "../../notifications";
import type {
  PartnerWorkspaceContext,
  PartnerWorkspaceContextService,
} from "./workspace-context.service";
import type { CommercialOpportunity, CommercialOpportunityRepository } from "../../commercial-opportunities";
import { enrichOpportunityProductReferences, opportunityProductReferenceIds } from "../../commercial-opportunities/services";
import type { CommercialCampaignRepository } from "../../commercial-campaigns/repositories/commercial-campaign.repository";
import type { DocumentRepository } from "../../documents/repositories";
import type { PartnerDocumentListItem } from "../../documents/types";
import type { PartnerMomentumRepository } from "../../partner-momentum/repositories";
import type { PartnerMomentumSummary } from "../../partner-momentum/types";
import type { PartnerSupportRepository, SupportDashboardItem } from "../../partner-support";
import type { PartnerEstimateSalesOpportunity, PartnerSalesWorkspaceService } from "../../partner-sales-workspace";
import type { FinanceRepository } from "../../finance/repositories";
import type { WarehouseArrivalRepository } from "../../warehouse-arrivals/repositories";
import { financeBusinessDate } from "../../finance/services/finance.service";
import { type EffectiveRollingPeriod } from "../../commerce-period";

export type WorkspaceQuickActionDto = {
  key: string;
  label: string;
  href: string;
};

export type WorkspaceAttentionItemDto = {
  id: string;
  kind: string;
  title: string;
  consequence: string;
  href: string;
  occurredAt: string;
  sourceFingerprint: string;
  dismissPolicy: "until_source_change" | "cooldown_7_days";
  severity: "info" | "warning";
  orderNumber: string | null;
  plannedDate: string | null;
  isTest: boolean;
  ctaLabel: string;
  consequenceSource?: "platform" | "source";
};

export type WorkspaceOrderDto = {
  id: string;
  number: string;
  date: string;
  statusLabel: string;
  plannedDate: string | null;
  positionCount: number;
  formattedTotal: string | null;
  href: string;
  isTest: boolean;
};

export type WorkspaceShipmentDto = {
  id: string;
  orderNumber: string;
  plannedDate: string;
  statusLabel: string;
  positionCount: number;
  totalUnits: number;
  pendingDateChange: boolean;
  href: string;
  isTest: boolean;
};

export type WorkspaceContinuationDto = {
  id: string;
  kind: "cart" | "estimate" | "purchasing_list";
  title: string;
  detail: string;
  updatedAt: string;
  href: string;
};

export type WorkspaceProductDto = {
  product: CatalogProductCardDto;
  commercialView?: ProductCommercialViewDto;
  purchaseCount?: number;
  lastPurchasedAt?: string;
  typicalQuantity?: number;
  sourceCodes?: Array<"TOP" | "NEW" | "HOT" | "ARRIVAL">;
  primaryDiscoverySignal?: DashboardDiscoverySignal;
};

export type DashboardDiscoverySignal = "HOT" | "NEW" | "TOP" | "ARRIVAL";

export type WorkspaceHomeDto = {
  viewer?: { companyId: string; userId: string };
  identity: {
    firstName: string;
    greeting: string;
  };
  company: {
    name: string;
    role: string;
    priceType: string | null;
  };
  capabilities: PartnerWorkspaceContext["capabilities"];
  attentionItems: WorkspaceAttentionItemDto[];
  orderSummary: {
    active: number;
    confirmed: number;
    attention: number;
    portalProcessing: number;
    recent: WorkspaceOrderDto[];
  };
  shipmentSummary: {
    overdue: number;
    today: number;
    nextThreeDays: number;
    later: number;
    items: WorkspaceShipmentDto[];
  };
  quickActions: WorkspaceQuickActionDto[];
  continuationItems: WorkspaceContinuationDto[];
  reorderProducts: WorkspaceProductDto[];
  reorderProductTotalCount: number;
  discoveryProducts: WorkspaceProductDto[];
  opportunities: CommercialOpportunity[];
  recentDocuments: PartnerDocumentListItem[];
  financeSummary: null | {
    totals: Array<{
      currency: string;
      receivable: number;
      advance: number;
    }>;
    contractCount: number;
    lastSuccessfulAt: string | null;
    stale: boolean;
  };
  financeGuidance: null | {
    state: "overdue" | "due_soon" | "healthy" | "unavailable";
    totals: Array<{ currency: string; outstanding: number; overdue: number }>;
    nextDueDate: string | null;
    fresh: boolean;
    calendar: {
      startDate: string;
      endDate: string;
      today: string;
      todayPosition: number;
      amountScaleMaximum: number;
      axisLabels: Array<{
        date: string;
        kind: "start" | "today" | "payment" | "end";
        positionPercent: number;
        track: 0 | 1;
        showOnMobile: boolean;
        align: "start" | "center" | "end";
      }>;
    };
    paymentGraph: Array<{
      id: string;
      eventDate: string;
      orderNumber: string;
      amount: number;
      currency: string;
      timing: "overdue" | "today" | "upcoming" | "paid";
      relativeHeight: number;
      positionPercent: number;
      stackIndex: number;
      stackCount: number;
    }>;
  };
  salesAnalytics: null | {
    businessDate: string;
    periodStart: string;
    periodEnd: string;
    totalOrderCount: number;
    series: Array<{
      currency: string;
      total: number;
      orderCount: number;
      averageOrder: number;
      comparisons: SalesTrendComparisonDto[];
      points: Array<{
        month: string;
        amount: number;
        orderCount: number;
        xPercent: number;
        yPercent: number;
        showLabel: boolean;
        showLabelOnMobile: boolean;
        labelAlign: "start" | "center" | "end";
      }>;
    }>;
  };
  companySummary: null | {
    activeEmployees: number;
    pendingInvitations: number;
    suspendedEmployees: number;
    retailOnlyEmployees: number;
    expiringInvitations: number;
    portalStatus: string;
    commercialReady: boolean;
  };
  commercialConfigurationMissing: boolean;
  purchasingDynamics: PartnerMomentumSummary | null;
  commercialFreshness: Array<{
    domain: "rates" | "prices" | "stock" | "arrivals";
    label: string;
    freshness: FreshnessView;
  }>;
  supportTickets?: SupportDashboardItem[];
  estimateSalesOpportunities?: PartnerEstimateSalesOpportunity[];
};

export type SalesTrendPeriod = 30 | 60 | 90 | 180;

export type SalesTrendState =
  | "INCREASE"
  | "DECREASE"
  | "UNCHANGED"
  | "NEW_ACTIVITY"
  | "NO_ACTIVITY";

export type SalesTrendComparisonDto = {
  days: SalesTrendPeriod;
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
  currentAmount: number;
  previousAmount: number;
  currentOrderCount: number;
  previousOrderCount: number;
  currentAverageOrder: number;
  changePercent: number | null;
  state: SalesTrendState;
};

export type WorkspaceSelectionPeriods = { repeat: EffectiveRollingPeriod };

export interface WorkspaceHomeService {
  getWorkspaceHome(userId: string, loginGeneration?: string, periods?: WorkspaceSelectionPeriods): Promise<WorkspaceHomeDto>;
  dismissAttention(userId: string, itemId: string, sourceFingerprint: string): Promise<void>;
}

export class DefaultWorkspaceHomeService implements WorkspaceHomeService {
  constructor(
    private readonly workspaceContextService: PartnerWorkspaceContextService,
    private readonly commercialFreshnessReadModel: CommercialFreshnessReadModel,
    private readonly dashboardRepository: WorkspaceDashboardRepository,
    private readonly pricingInventoryService: PricingInventoryService,
    private readonly notificationRepository?: NotificationRepository,
    private readonly opportunityRepository?: CommercialOpportunityRepository,
    _campaignRepository?: CommercialCampaignRepository,
    private readonly documentRepository?: DocumentRepository,
    private readonly productReferenceService?: ProductReferenceService,
    private readonly momentumRepository?: PartnerMomentumRepository,
    private readonly supportRepository?: PartnerSupportRepository,
    private readonly salesWorkspaceService?: PartnerSalesWorkspaceService,
    private readonly financeRepository?: FinanceRepository,
    private readonly warehouseArrivalRepository?: WarehouseArrivalRepository,
  ) {}

  async dismissAttention(
    userId: string,
    itemId: string,
    sourceFingerprint: string,
  ): Promise<void> {
    const context = await this.workspaceContextService.getWorkspaceContext(userId);
    if (!context.companyId || !this.dashboardRepository.dismissAttention) {
      throw new InvalidStateError("Dashboard attention cannot be dismissed.");
    }
    await this.dashboardRepository.dismissAttention(
      context.companyId,
      itemId,
      sourceFingerprint,
    );
  }

  async getWorkspaceHome(userId: string, loginGeneration = "legacy-session", periods: WorkspaceSelectionPeriods = { repeat: 365 }): Promise<WorkspaceHomeDto> {
    const context = await this.workspaceContextService.getWorkspaceContext(userId);
    if (
      (context.accessState !== "active"
        && context.accessState !== "missing_price_type")
      || !context.companyId
    ) {
      throw new InvalidStateError("Partner workspace access is not active.");
    }
    const companyId = context.companyId;

    const canViewFinance = context.capabilities.navigation.some((item) => item.key === "finance" && item.availability === "available");
    const canViewSales = context.capabilities.navigation.some((item) => item.key === "orders" && item.availability === "available");
    const [freshness, dashboard, selections, opportunityPage, supportTickets, estimateSalesOpportunities, financeData, currentReplenishment] = await Promise.all([
      timedDashboardRead("commercial_freshness", () => this.commercialFreshnessReadModel.getFreshness()),
      timedDashboardRead("dashboard_aggregate", () => this.dashboardRepository.getDashboard(companyId)),
      timedDashboardRead("product_selections", () => this.dashboardRepository.getProductSelections?.(userId, companyId, loginGeneration, {
        repeat: periods.repeat,
        popular: 365,
        new: 365,
        hot: 365,
      }) ?? Promise.resolve(null)),
      timedDashboardRead("opportunities", () => this.opportunityRepository?.list({ companyId, filter: "all", limit: 12, offset: 0 })
        ?? Promise.resolve({ items: [], totalCount: 0 })),
      timedDashboardRead("support_tickets", () => this.supportRepository?.dashboard(companyId) ?? Promise.resolve([])),
      timedDashboardRead("estimate_sales_opportunities", () => this.salesWorkspaceService?.listEstimateOpportunities(companyId, userId, {
        canView: context.capabilities.canViewEstimates,
        canSend: context.capabilities.canSendProposal,
        canConvert: context.capabilities.canConvertEstimates,
        canManageOrders: context.capabilities.productCard.canAddToOrder,
      }, 6) ?? Promise.resolve([])),
      timedDashboardRead("finance_guidance", () => canViewFinance && this.financeRepository
        ? this.financeRepository.getOverviewData(companyId)
        : Promise.resolve(null)),
      timedDashboardRead("current_replenishment", () => this.warehouseArrivalRepository?.getCurrentReplenishment(companyId) ?? Promise.resolve([])),
    ]);
    const reorderCandidates = sessionOrder(
      selections?.previousProducts ?? dashboard.reorderProducts,
      loginGeneration,
      "previous-purchases",
    );
    const merchandisingCandidates = selections?.merchandisingProducts ?? dashboard.merchandisingProducts;
    const popularCandidates = selections?.popularProducts ?? [];
    const newCandidates = selections?.newProducts ?? [];
    const hotCandidates = selections?.hotProducts ?? [];
    const arrivalCandidates: WorkspaceDashboardProductCandidate[] = currentReplenishment.map((item) => ({
      id: item.productId,
      sku: "",
      name: "",
      slug: "",
      imageUrl: null,
      categoryId: null,
      categoryName: null,
      labelCodes: [],
      sourceCodes: ["ARRIVAL"],
    }));
    const discoveryCandidates = mixDashboardDiscoveryCandidates({
      arrival: arrivalCandidates.length
        ? arrivalCandidates
        : merchandisingCandidates.filter((candidate) => candidate.sourceCodes?.includes("ARRIVAL")),
      hot: hotCandidates,
      new: newCandidates,
      popular: popularCandidates,
    });
    const opportunityCandidates = sessionOrderByPriority(
      opportunityPage.items.filter((item) => item.product),
      loginGeneration,
      "opportunities",
    ).slice(0, 4);
    const candidates = uniqueCandidates([
      ...reorderCandidates,
      ...discoveryCandidates.map((item) => item.candidate),
    ]);
    const opportunityProductIds = opportunityProductReferenceIds(opportunityCandidates);
    const referenceProductIds = [...new Set([
      ...candidates.map((candidate) => candidate.id),
      ...opportunityProductIds,
    ])];
    const [commercialViews, references] = await Promise.all([
      candidates.length
        ? this.pricingInventoryService.getProductCommercialViews(userId, candidates.map((candidate) => candidate.id))
        : Promise.resolve([]),
      referenceProductIds.length && this.productReferenceService
        ? this.productReferenceService.getProductReferencesByIds(userId, referenceProductIds)
        : Promise.resolve([]),
    ]);
    const commercialByProduct = new Map(
      commercialViews.map((view) => [view.productId, view]),
    );
    const referenceByProduct = new Map(references.map((reference) => [reference.productId, reference]));
    const opportunities = enrichOpportunityProductReferences(opportunityCandidates, references);
    console.info({
      event: "dashboard_opportunity_image_enrichment_completed",
      productReferences: opportunityProductIds.length,
      mappedImages: opportunities.filter((item) => item.product?.reference?.thumbnail).length,
      fallbackImages: opportunities.filter((item) => item.product && !item.product.reference?.thumbnail).length,
      templateOpportunities: opportunities.filter((item) => item.template && !item.product).length,
    });
    const freshnessByDomain = new Map(
      freshness.map((item) => [item.domain, item.updatedAt]),
    );
    const attentionItems = dashboard.attentionItems.map(toAttentionItem);
    const reorderProducts = reorderCandidates.flatMap((candidate) => {
      const commercialView = commercialByProduct.get(candidate.id);
      return isCurrentlySellable(commercialView)
        ? [{
            product: toProduct(candidate, referenceByProduct.get(candidate.id)),
            commercialView,
            purchaseCount: candidate.purchaseCount,
            lastPurchasedAt: candidate.lastPurchasedAt,
            typicalQuantity: candidate.typicalQuantity,
          }]
        : [];
    }).slice(0, 5);
    const discoveryProducts = discoveryCandidates.map(({ candidate, signal }) => ({
      product: toProduct(
        candidate,
        referenceByProduct.get(candidate.id),
        signal === "ARRIVAL" ? [] : [signal],
      ),
      commercialView: commercialByProduct.get(candidate.id),
      sourceCodes: candidate.sourceCodes,
      primaryDiscoverySignal: signal,
    }));

    logDashboardShortage("previous_purchases", reorderProducts.length, 5);
    logDashboardShortage("opportunities", opportunities.length, 4);
    logDashboardShortage("discovery", discoveryProducts.length, 6);

    return {
      viewer: { companyId, userId },
      identity: {
        firstName: firstName(context.userDisplayName),
        greeting: greeting(),
      },
      company: {
        name: context.companyName ?? "Компания",
        role: context.membershipRole ?? "Партнёр",
        priceType: context.capabilities.productCard.showPartnerPrice
          ? context.priceTypeName
          : null,
      },
      capabilities: context.capabilities,
      attentionItems: attentionItems.slice(0, 8),
      orderSummary: {
        ...dashboard.orderSummary,
        recent: dashboard.orderSummary.recent.map((order) => ({
          id: order.id,
          number: order.number || "Заказ обрабатывается",
          date: order.date,
          statusLabel: orderStatus(order.posted, order.stateCode),
          plannedDate: order.plannedDate,
          positionCount: order.positionCount,
          formattedTotal: formatMoney(order.total, order.currency),
          href: order.href,
          isTest: order.isTest,
        })),
      },
      shipmentSummary: {
        ...dashboard.shipmentSummary,
        items: dashboard.shipmentSummary.items.map((shipment) => ({
          id: shipment.id,
          orderNumber: shipment.orderNumber,
          plannedDate: shipment.plannedDate,
          statusLabel: orderStatus(shipment.posted, shipment.stateCode),
          positionCount: shipment.positionCount,
          totalUnits: shipment.totalUnits,
          pendingDateChange: shipment.pendingDateChange,
          href: `/cabinet/orders/${shipment.id}`,
          isTest: shipment.isTest,
        })),
      },
      quickActions: buildQuickActions(
        context.capabilities.navigation,
      ),
      continuationItems: dashboard.continuationItems.map(toContinuation),
      reorderProducts,
      reorderProductTotalCount: selections?.previousCandidateCount ?? reorderProducts.length,
      discoveryProducts,
      opportunities,
      recentDocuments: [],
      financeSummary: dashboard.financeSummary,
      financeGuidance: financeData ? buildFinanceGuidance(financeData.obligations, financeData.syncState?.lastSuccessAt ?? null) : null,
      salesAnalytics: canViewSales ? buildSalesAnalytics(dashboard.salesAnalytics) : null,
      companySummary: dashboard.companySummary,
      commercialConfigurationMissing: context.accessState === "missing_price_type",
      purchasingDynamics: null,
      commercialFreshness: [
        freshnessItem("prices", "Цены", freshnessByDomain.get("prices")),
        freshnessItem("stock", "Остатки", freshnessByDomain.get("stock")),
        freshnessItem("rates", "Коммерческие курсы", freshnessByDomain.get("rates")),
        freshnessItem(
          "arrivals",
          "Ожидаемые поступления",
          freshnessByDomain.get("arrivals"),
        ),
      ],
      supportTickets,
      estimateSalesOpportunities,
    };
  }
}

export function buildSalesAnalytics(
  analytics: WorkspaceDashboardProjection["salesAnalytics"],
): NonNullable<WorkspaceHomeDto["salesAnalytics"]> {
  return {
    businessDate: analytics.businessDate,
    periodStart: analytics.periodStart,
    periodEnd: analytics.periodEnd,
    totalOrderCount: analytics.series.reduce((total, series) => total + series.orderCount, 0),
    series: analytics.series.map((series) => {
      const maximum = Math.max(0, ...series.points.map((point) => point.amount));
      const lastIndex = Math.max(0, series.points.length - 1);
      return {
        currency: series.currency,
        total: series.total,
        orderCount: series.orderCount,
        averageOrder: series.averageOrder,
        comparisons: series.comparisons.map(buildSalesTrendComparison),
        points: series.points.map((point, index) => {
          const relativeHeight = point.amount > 0 && maximum > 0
            ? Math.max(12, Math.round((point.amount / maximum) * 100))
            : 0;
          return {
            ...point,
            xPercent: lastIndex === 0 ? 50 : 2.5 + (index / lastIndex) * 95,
            yPercent: 90 - relativeHeight * 0.7,
            showLabel: index === 0 || index === lastIndex || index % 3 === 0,
            showLabelOnMobile: index === 0 || index === Math.ceil(lastIndex / 2) || index === lastIndex,
            labelAlign: index === 0 ? "start" : index === lastIndex ? "end" : "center",
          };
        }),
      };
    }),
  };
}

export function buildSalesTrendComparison(
  comparison: WorkspaceDashboardProjection["salesAnalytics"]["series"][number]["comparisons"][number],
): SalesTrendComparisonDto {
  const { currentAmount, previousAmount, currentOrderCount } = comparison;
  let state: SalesTrendState;
  let changePercent: number | null;

  if (previousAmount === 0) {
    state = currentAmount > 0 ? "NEW_ACTIVITY" : "NO_ACTIVITY";
    changePercent = null;
  } else {
    changePercent = Math.round((((currentAmount - previousAmount) / previousAmount) * 100) * 10) / 10;
    state = currentAmount > previousAmount
      ? "INCREASE"
      : currentAmount < previousAmount
        ? "DECREASE"
        : "UNCHANGED";
  }

  return {
    ...comparison,
    currentAverageOrder: currentOrderCount > 0 ? currentAmount / currentOrderCount : 0,
    changePercent,
    state,
  };
}

export function buildFinanceGuidance(
  obligations: Awaited<ReturnType<FinanceRepository["getOverviewData"]>>["obligations"],
  synchronizedAt: string | null,
): NonNullable<WorkspaceHomeDto["financeGuidance"]> {
  const today = financeBusinessDate(new Date());
  const calendarWindow = getPaymentCalendarWindow(obligations, today);
  const current = obligations.filter((row) => row.reconciliationStatus === "READY" && row.paymentStatus !== "SETTLED" && Number(row.remainingAmount) > 0);
  const recentlyPaid = obligations.filter((row) => {
    const settledDate = row.settlementLastPaymentAt?.slice(0, 10);
    return row.reconciliationStatus === "READY"
      && row.paymentStatus === "SETTLED"
      && Number(row.paidAmount) > 0
      && Boolean(settledDate && settledDate >= calendarWindow.rangeStart && settledDate <= calendarWindow.rangeEnd);
  });
  const totals = new Map<string, { outstanding: number; overdue: number }>();
  for (const row of current) {
    const total = totals.get(row.currency) ?? { outstanding: 0, overdue: 0 };
    total.outstanding += Number(row.remainingAmount);
    if (row.dueDate < today) total.overdue += Number(row.remainingAmount);
    totals.set(row.currency, total);
  }
  const nextDueDate = current.map((row) => row.dueDate).sort()[0] ?? null;
  const fresh = Boolean(synchronizedAt && Date.now() - Date.parse(synchronizedAt) <= 3 * 60 * 60 * 1000);
  const currentGraphCandidates = current
    .filter((row) => row.dueDate >= calendarWindow.rangeStart && row.dueDate <= calendarWindow.rangeEnd)
    .sort((left, right) => {
      const timingRank = (dueDate: string) => dueDate < today ? 0 : dueDate === today ? 1 : 2;
      return timingRank(left.dueDate) - timingRank(right.dueDate)
        || left.dueDate.localeCompare(right.dueDate)
        || left.id.localeCompare(right.id);
    })
    .slice(0, 24);
  const paidGraphCandidates = recentlyPaid
    .sort((left, right) => (right.settlementLastPaymentAt ?? "").localeCompare(left.settlementLastPaymentAt ?? ""))
    .slice(0, Math.max(0, 24 - currentGraphCandidates.length));
  const graphCandidates = [
    ...currentGraphCandidates.map((row) => ({ row, eventDate: row.dueDate, timing: row.dueDate < today ? "overdue" as const : row.dueDate === today ? "today" as const : "upcoming" as const, amount: Number(row.remainingAmount) })),
    ...paidGraphCandidates.map((row) => ({ row, eventDate: row.settlementLastPaymentAt!.slice(0, 10), timing: "paid" as const, amount: Number(row.paidAmount) })),
  ];
  const stackCounts = new Map<string, number>();
  for (const item of graphCandidates) {
    stackCounts.set(item.eventDate, (stackCounts.get(item.eventDate) ?? 0) + 1);
  }
  const stackIndexes = new Map<string, number>();
  const amountScaleMaximum = Math.max(0, ...graphCandidates.map((item) => item.amount));
  const axisLabels = buildPaymentCalendarAxisLabels(
    graphCandidates.map((item) => ({ date: item.eventDate, amount: item.amount })),
    calendarWindow.rangeStart,
    calendarWindow.rangeEnd,
    today,
  );
  return {
    state: !fresh ? "unavailable" : [...totals.values()].some((row) => row.overdue > 0)
      ? "overdue" : nextDueDate && nextDueDate <= addDays(today, 7) ? "due_soon" : "healthy",
    totals: [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, value]) => ({ currency, ...value })),
    nextDueDate,
    fresh,
    calendar: {
      startDate: calendarWindow.rangeStart,
      endDate: calendarWindow.rangeEnd,
      today,
      todayPosition: timelinePosition(today, calendarWindow.rangeStart, calendarWindow.rangeEnd),
      amountScaleMaximum,
      axisLabels,
    },
    paymentGraph: graphCandidates.map((item) => {
      const stackIndex = stackIndexes.get(item.eventDate) ?? 0;
      stackIndexes.set(item.eventDate, stackIndex + 1);
      return {
        id: item.row.id,
        eventDate: item.eventDate,
        orderNumber: item.row.orderNumber,
        amount: item.amount,
        currency: item.row.currency,
        timing: item.timing,
        relativeHeight: Math.max(22, Math.min(100, Math.round((item.amount / (amountScaleMaximum || 1)) * 100))),
        positionPercent: Math.max(2.5, Math.min(97.5, timelinePosition(item.eventDate, calendarWindow.rangeStart, calendarWindow.rangeEnd))),
        stackIndex,
        stackCount: stackCounts.get(item.eventDate) ?? 1,
      };
    }),
  };
}

export function getPaymentCalendarWindow(
  payments: Awaited<ReturnType<FinanceRepository["getOverviewData"]>>["obligations"],
  today: string,
): {
  rangeStart: string;
  rangeEnd: string;
  today: string;
  latestRelevantPaymentDate: string | null;
} {
  const relevantDates = payments.flatMap((payment) => {
    if (payment.reconciliationStatus !== "READY") return [];
    if (payment.paymentStatus === "SETTLED") {
      const paidDate = payment.settlementLastPaymentAt?.slice(0, 10);
      return Number(payment.paidAmount) > 0 && paidDate ? [paidDate] : [];
    }
    return Number(payment.remainingAmount) > 0 ? [payment.dueDate] : [];
  }).filter(isIsoDate);
  const latestRelevantPaymentDate = relevantDates.sort().at(-1) ?? null;
  const rangeEnd = latestRelevantPaymentDate && latestRelevantPaymentDate > today
    ? latestRelevantPaymentDate
    : today;
  const nominalRangeStart = addDays(rangeEnd, -120);

  return {
    rangeStart: nominalRangeStart > today ? today : nominalRangeStart,
    rangeEnd,
    today,
    latestRelevantPaymentDate,
  };
}

function buildPaymentCalendarAxisLabels(
  payments: Array<{ date: string; amount: number }>,
  rangeStart: string,
  rangeEnd: string,
  today: string,
): NonNullable<WorkspaceHomeDto["financeGuidance"]>["calendar"]["axisLabels"] {
  const labels: Array<Omit<NonNullable<WorkspaceHomeDto["financeGuidance"]>["calendar"]["axisLabels"][number], "track">> = [];
  const addAnchor = (date: string, kind: "start" | "today" | "end", align: "start" | "center" | "end") => {
    const existing = labels.find((label) => label.date === date);
    if (existing) {
      if (kind === "today") {
        existing.kind = "today";
        existing.align = align;
      }
      return;
    }
    labels.push({
      date,
      kind,
      positionPercent: timelinePosition(date, rangeStart, rangeEnd),
      showOnMobile: true,
      align,
    });
  };

  addAnchor(rangeStart, "start", "start");
  addAnchor(rangeEnd, "end", "end");
  addAnchor(today, "today", today === rangeStart ? "start" : today === rangeEnd ? "end" : "center");

  const amountByDate = new Map<string, number>();
  for (const payment of payments) {
    amountByDate.set(payment.date, Math.max(amountByDate.get(payment.date) ?? 0, payment.amount));
  }
  const internalDates = [...amountByDate.keys()]
    .filter((date) => date !== rangeStart && date !== rangeEnd && date !== today)
    .sort();
  const significantDates = [...internalDates].sort((left, right) =>
    (amountByDate.get(right) ?? 0) - (amountByDate.get(left) ?? 0)
      || left.localeCompare(right));
  for (const date of [...new Set([...significantDates, internalDates[0], internalDates.at(-1)])]) {
    if (!date || labels.filter((label) => label.kind === "payment").length >= 2) break;
    const positionPercent = timelinePosition(date, rangeStart, rangeEnd);
    if (labels.some((label) => Math.abs(label.positionPercent - positionPercent) < 15)) continue;
    labels.push({
      date,
      kind: "payment",
      positionPercent,
      showOnMobile: false,
      align: "center",
    });
  }

  const lastPositionByTrack = [-Infinity, -Infinity];
  return labels
    .sort((left, right) => left.positionPercent - right.positionPercent)
    .map((label) => {
      const trackZeroGap = label.positionPercent - lastPositionByTrack[0];
      const trackOneGap = label.positionPercent - lastPositionByTrack[1];
      const track = (trackZeroGap >= 18 ? 0 : trackOneGap >= 18 ? 1 : trackZeroGap >= trackOneGap ? 0 : 1) as 0 | 1;
      lastPositionByTrack[track] = label.positionPercent;
      return { ...label, track };
    });
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function timelinePosition(value: string, start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const valueMs = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(valueMs) || endMs <= startMs) return 0;
  return Math.max(0, Math.min(100, ((valueMs - startMs) / (endMs - startMs)) * 100));
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function logDashboardShortage(section: string, eligibleCount: number, targetCount: number): void {
  if (eligibleCount >= targetCount) return;
  console.info({
    event: "dashboard_product_selection_shortage",
    section,
    eligibleCount,
    targetCount,
    reason: eligibleCount === 0 ? "no_eligible_candidates" : "insufficient_eligible_candidates",
  });
}

async function timedDashboardRead<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    console.info(JSON.stringify({
      event: "dashboard_read_completed",
      stage,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    }));
  }
}

function freshnessItem(
  domain: "rates" | "prices" | "stock" | "arrivals",
  label: string,
  updatedAt: string | null | undefined,
) {
  return {
    domain,
    label,
    freshness: evaluateFreshness(
      updatedAt,
      domain === "stock" || domain === "arrivals" ? "stock" : "price",
      label,
    ),
  };
}

function toAttentionItem(
  item: Awaited<
    ReturnType<WorkspaceDashboardRepository["getDashboard"]>
  >["attentionItems"][number],
): WorkspaceAttentionItemDto {
  const metadata = attentionMetadata(item);
  if (
    item.kind === "notification_cart_product_price_changed"
    || item.kind === "notification_cart_product_availability_changed"
  ) {
    return {
      ...metadata,
      title: item.title ?? "Корзина требует проверки",
      consequence: item.description ?? "Проверьте актуальные цены и наличие перед отправкой заказа.",
    };
  }
  if (item.kind === "notification_warehouse_arrival_completed") {
    return {
      ...metadata,
      title: item.title ?? "Новое пополнение склада",
      consequence: item.description ?? "Товары поступили на склад и доступны для отгрузки.",
    };
  }
  switch (item.kind) {
    case "test_return_overdue": {
      const days = daysSince(item.plannedDate);
      return {
        ...metadata,
        title: "Тестовый период завершён",
        consequence: `Тестовый период завершён ${days} дн. назад. Просим вернуть оборудование в товарном виде на склад Novotech.`,
      };
    }
    case "test_return_today":
      return {
        ...metadata,
        title: "Тестовый период завершается сегодня",
        consequence: "Просим подготовить оборудование к возврату.",
      };
    case "portal_order_failure":
      return {
        ...metadata,
        title: item.objectNumber
          ? `Заказ ${item.objectNumber} требует проверки`
          : "Отправка заказа требует проверки",
        consequence: "Корзина сохранена. Откройте заказ и проверьте статус.",
      };
    case "shipment_overdue":
      return {
        ...metadata,
        title: `Отгрузка заказа ${item.objectNumber ?? ""} просрочена`.trim(),
        consequence: "Проверьте текущую дату и при необходимости запросите перенос.",
      };
    case "shipment_today":
      return {
        ...metadata,
        title: `Отгрузка заказа ${item.objectNumber ?? ""} запланирована сегодня`.trim(),
        consequence: "Откройте заказ, чтобы проверить позиции и текущий статус.",
      };
    case "date_change_rejected":
      return {
        ...metadata,
        title: `Перенос даты по заказу ${item.objectNumber ?? ""} отклонён`.trim(),
        consequence: item.comment || "Откройте заказ для просмотра решения.",
        consequenceSource: item.comment ? "source" : "platform",
      };
    case "date_change_pending":
      return {
        ...metadata,
        title: `Запрос переноса по заказу ${item.objectNumber ?? ""} рассматривается`.trim(),
        consequence: "Novotech проверяет возможность изменения даты отгрузки.",
      };
    default:
      return {
        ...metadata,
        title: "Заказ требует внимания",
        consequence: "Откройте заказ и проверьте актуальное состояние.",
      };
  }
}

function attentionMetadata(
  item: Awaited<ReturnType<WorkspaceDashboardRepository["getDashboard"]>>["attentionItems"][number],
) {
  return {
    id: item.id,
    kind: item.kind,
    href: item.href,
    occurredAt: item.occurredAt,
    sourceFingerprint: item.sourceFingerprint,
    dismissPolicy: item.dismissPolicy,
    severity: item.severity,
    orderNumber: item.objectNumber,
    plannedDate: item.plannedDate,
    isTest: item.kind === "test_return_overdue" || item.kind === "test_return_today",
    ctaLabel: item.ctaLabel,
  };
}

function daysSince(value: string | null): number {
  if (!value) return 0;
  const date = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((today - date) / 86_400_000));
}

function toContinuation(
  item: Awaited<
    ReturnType<WorkspaceDashboardRepository["getDashboard"]>
  >["continuationItems"][number],
): WorkspaceContinuationDto {
  if (item.kind === "cart") {
    return {
      id: item.id,
      kind: item.kind,
      title: "Активная корзина",
      detail: `${item.positionCount} поз. · ${item.totalUnits} шт.`,
      updatedAt: item.updatedAt,
      href: "/cabinet/cart",
    };
  }
  if (item.kind === "estimate") {
    return {
      id: item.id,
      kind: item.kind,
      title: item.name || "Черновик сметы",
      detail: `${item.positionCount} позиций`,
      updatedAt: item.updatedAt,
      href: `/cabinet/estimates/${item.id}`,
    };
  }
  return {
    id: item.id,
    kind: item.kind,
    title: item.name || "Комплект",
    detail: `${item.positionCount} поз. · ${item.totalUnits} шт.`,
    updatedAt: item.updatedAt,
    href: `/cabinet/purchasing-lists/${item.id}`,
  };
}

export function buildQuickActions(
  navigation: WorkspaceNavigationItem[],
): WorkspaceQuickActionDto[] {
  const hrefs = new Map(
    navigation.flatMap((item) =>
      item.availability === "available" && item.href
        ? [[item.key, item.href] as const]
        : [],
    ),
  );
  const candidates: Array<readonly [string, string, string | undefined]> = [
    ["cart", "Открыть корзину", hrefs.get("cart")],
    ["quick_product_selection", "Быстрый подбор товаров", hrefs.get("catalog") && hrefs.get("cart") ? "/cabinet/quick-order" : undefined],
    ["repeat_order", "Повторить заказ", hrefs.get("orders")],
    ["estimate", "Создать смету", hrefs.get("proposals") ? `${hrefs.get("proposals")}/new` : undefined],
    ["register_warranty", "Создать сервисную заявку", hrefs.get("warranty") ? `${hrefs.get("warranty")}/new` : undefined],
    ["it_support", "Обратиться в IT-поддержку", hrefs.get("support") ? `${hrefs.get("support")}/new` : undefined],
    ["documents", "Найти документ", hrefs.get("documents")],
  ];

  return candidates.flatMap(([key, label, href]) =>
    href ? [{ key, label, href }] : [],
  ).slice(0, 8);
}

function toProduct(
  candidate: WorkspaceDashboardProductCandidate,
  reference?: ProductReferenceDto,
  merchandisingLabels = candidate.labelCodes,
): CatalogProductCardDto {
  return {
    id: candidate.id,
    sku: reference?.sku ?? candidate.sku,
    name: reference?.name ?? candidate.name,
    slug: reference?.slug ?? candidate.slug,
    shortDescription: null,
    imageUrl: reference?.thumbnail ?? candidate.imageUrl,
    brand: null,
    category: candidate.categoryId
      ? {
          id: candidate.categoryId,
          parentId: null,
          name: candidate.categoryName ?? "Каталог",
          slug: "",
          description: null,
        }
      : null,
    keyCharacteristics: [],
    datasheet: null,
    merchandisingLabels,
  };
}

export function mixDashboardDiscoveryCandidates(
  sources: {
    hot: WorkspaceDashboardProductCandidate[];
    new: WorkspaceDashboardProductCandidate[];
    popular: WorkspaceDashboardProductCandidate[];
    arrival: WorkspaceDashboardProductCandidate[];
  },
  limit = 6,
): Array<{ candidate: WorkspaceDashboardProductCandidate; signal: DashboardDiscoverySignal }> {
  const pools: Array<{
    signal: DashboardDiscoverySignal;
    candidates: WorkspaceDashboardProductCandidate[];
  }> = [
    { signal: "HOT", candidates: sources.hot },
    { signal: "NEW", candidates: sources.new },
    { signal: "TOP", candidates: sources.popular },
    { signal: "ARRIVAL", candidates: sources.arrival },
  ];
  const selected: Array<{ candidate: WorkspaceDashboardProductCandidate; signal: DashboardDiscoverySignal }> = [];
  const selectedIds = new Set<string>();
  const cursorBySignal = new Map<DashboardDiscoverySignal, number>();

  const takeNext = (pool: (typeof pools)[number]): boolean => {
    let cursor = cursorBySignal.get(pool.signal) ?? 0;
    while (cursor < pool.candidates.length) {
      const candidate = pool.candidates[cursor++];
      cursorBySignal.set(pool.signal, cursor);
      if (selectedIds.has(candidate.id)) continue;
      selectedIds.add(candidate.id);
      selected.push({ candidate, signal: pool.signal });
      return true;
    }
    return false;
  };

  for (const pool of pools) {
    if (selected.length >= limit) break;
    takeNext(pool);
  }
  while (selected.length < limit) {
    let added = false;
    for (const pool of pools) {
      if (selected.length >= limit) break;
      added = takeNext(pool) || added;
    }
    if (!added) break;
  }
  return selected;
}

function uniqueCandidates(
  candidates: WorkspaceDashboardProductCandidate[],
): WorkspaceDashboardProductCandidate[] {
  return [...new Map(candidates.map((item) => [item.id, item])).values()];
}

function sessionOrder<T extends { id: string }>(
  items: readonly T[],
  loginGeneration: string,
  scope: string,
): T[] {
  if (items.length < 2) return [...items];
  return [...items].sort((left, right) => {
    const leftRank = createHash("sha256")
      .update(`${scope}:${loginGeneration}:${left.id}`)
      .digest("hex");
    const rightRank = createHash("sha256")
      .update(`${scope}:${loginGeneration}:${right.id}`)
      .digest("hex");
    return leftRank.localeCompare(rightRank) || left.id.localeCompare(right.id);
  });
}

function sessionOrderByPriority<T extends { id: string; priority: number }>(
  items: readonly T[],
  loginGeneration: string,
  scope: string,
): T[] {
  const sessionRanked = sessionOrder(items, loginGeneration, scope);
  return sessionRanked.sort((left, right) => left.priority - right.priority);
}

function isCurrentlySellable(
  view: ProductCommercialViewDto | undefined,
): boolean {
  const hasPermittedPrice = Boolean(view?.partnerPrice || view?.retailPrice);
  const hasSupply = Boolean(
    view?.stock
    && (
      (view.stock.exactAvailableQuantity ?? 0) > 0
      || view.stock.expectedArrival
    ),
  );
  return hasPermittedPrice && hasSupply;
}

function orderStatus(posted: boolean, stateCode: string | null): string {
  if (!posted) return "Заказ обрабатывается";
  switch (stateCode) {
    case "completed":
      return "Завершён";
    case "preorder":
      return "Предзаказ";
    case "test":
      return "Тест";
    case "open":
      return "Открыт";
    default:
      return "Статус уточняется";
  }
}

function formatMoney(amount: number | null, currency: string | null): string | null {
  if (amount === null || !currency) return null;
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "партнёр";
}

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Europe/Chisinau",
    }).format(new Date()),
  );
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}
import { createHash } from "node:crypto";
