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
import { enrichOpportunityProductReferences } from "../../commercial-opportunities/services";
import type { CommercialCampaignRepository } from "../../commercial-campaigns/repositories/commercial-campaign.repository";
import type { PartnerCampaign } from "../../commercial-campaigns/types";
import type { DocumentRepository } from "../../documents/repositories";
import type { PartnerDocumentListItem } from "../../documents/types";
import type { PartnerMomentumRepository } from "../../partner-momentum/repositories";
import type { PartnerMomentumSummary } from "../../partner-momentum/types";
import type { PartnerSupportRepository, SupportDashboardItem } from "../../partner-support";

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
};

export type WorkspaceHomeDto = {
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
  merchandisingProducts: WorkspaceProductDto[];
  opportunities: CommercialOpportunity[];
  campaigns: PartnerCampaign[];
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
};

export interface WorkspaceHomeService {
  getWorkspaceHome(userId: string, loginGeneration?: string): Promise<WorkspaceHomeDto>;
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
    private readonly campaignRepository?: CommercialCampaignRepository,
    private readonly documentRepository?: DocumentRepository,
    private readonly productReferenceService?: ProductReferenceService,
    private readonly momentumRepository?: PartnerMomentumRepository,
    private readonly supportRepository?: PartnerSupportRepository,
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

  async getWorkspaceHome(userId: string, loginGeneration = "legacy-session"): Promise<WorkspaceHomeDto> {
    const context = await this.workspaceContextService.getWorkspaceContext(userId);
    if (
      (context.accessState !== "active"
        && context.accessState !== "missing_price_type")
      || !context.companyId
    ) {
      throw new InvalidStateError("Partner workspace access is not active.");
    }
    const companyId = context.companyId;

    const [freshness, dashboard, selections, opportunityPage, campaignPage, supportTickets] = await Promise.all([
      timedDashboardRead("commercial_freshness", () => this.commercialFreshnessReadModel.getFreshness()),
      timedDashboardRead("dashboard_aggregate", () => this.dashboardRepository.getDashboard(companyId)),
      timedDashboardRead("product_selections", () => this.dashboardRepository.getProductSelections?.(userId, companyId, loginGeneration) ?? Promise.resolve(null)),
      timedDashboardRead("opportunities", () => this.opportunityRepository?.list({ companyId, filter: "all", limit: 12, offset: 0 })
        ?? Promise.resolve({ items: [], totalCount: 0 })),
      timedDashboardRead("campaigns", () => this.campaignRepository?.listPartner({ companyId, filter: "active", limit: 2, offset: 0 })
        ?? Promise.resolve({ items: [], totalCount: 0 })),
      timedDashboardRead("support_tickets", () => this.supportRepository?.dashboard(companyId) ?? Promise.resolve([])),
    ]);
    const reorderCandidates = sessionOrder(
      selections?.previousProducts ?? dashboard.reorderProducts,
      loginGeneration,
      "previous-purchases",
    );
    const merchandisingCandidates = selections?.merchandisingProducts ?? dashboard.merchandisingProducts;
    const opportunityCandidates = sessionOrder(
      opportunityPage.items,
      loginGeneration,
      "opportunities",
    ).slice(0, 4);
    const candidates = uniqueCandidates([
      ...reorderCandidates,
      ...merchandisingCandidates,
    ]);
    const opportunityProductIds = [...new Set(opportunityCandidates.flatMap((item) => item.product ? [item.product.id] : []))];
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
    const opportunityProductIdsSet = new Set(
      opportunities.flatMap((item) => item.product ? [item.product.id] : []),
    );
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
    const merchandisingProducts = merchandisingCandidates
      .filter((candidate) => !opportunityProductIdsSet.has(candidate.id))
      .slice(0, 5)
      .map((candidate) => ({
        product: toProduct(candidate, referenceByProduct.get(candidate.id)),
        commercialView: commercialByProduct.get(candidate.id),
      }));

    logDashboardShortage("previous_purchases", reorderProducts.length, 5);
    logDashboardShortage("opportunities", opportunities.length, 4);
    logDashboardShortage("novotech_offers", merchandisingProducts.length, 5);

    return {
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
      merchandisingProducts,
      opportunities,
      campaigns: campaignPage.items,
      recentDocuments: [],
      financeSummary: dashboard.financeSummary,
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
    };
  }
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
    title: item.name || "Список закупок",
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
    ["repeat_order", "Повторить заказ", hrefs.get("orders")],
    ["estimate", "Создать смету", hrefs.get("proposals") ? `${hrefs.get("proposals")}/new` : undefined],
    ["register_warranty", "Создать сервисную заявку", hrefs.get("warranty") ? `${hrefs.get("warranty")}/new` : undefined],
    ["it_support", "Обратиться в IT-поддержку", hrefs.get("support") ? `${hrefs.get("support")}/new` : undefined],
    ["purchase_templates", "Открыть шаблоны закупок", hrefs.get("purchase_templates")],
    ["documents", "Найти документ", hrefs.get("documents")],
  ];

  return candidates.flatMap(([key, label, href]) =>
    href ? [{ key, label, href }] : [],
  ).slice(0, 7);
}

function toProduct(
  candidate: WorkspaceDashboardProductCandidate,
  reference?: ProductReferenceDto,
): CatalogProductCardDto {
  return {
    id: candidate.id,
    sku: candidate.sku,
    name: candidate.name,
    slug: candidate.slug,
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
    merchandisingLabels: candidate.labelCodes,
  };
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
