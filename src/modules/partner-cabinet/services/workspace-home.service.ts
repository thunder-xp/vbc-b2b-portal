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
  PartnerNotification,
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
};

export interface WorkspaceHomeService {
  getWorkspaceHome(userId: string, loginGeneration?: string): Promise<WorkspaceHomeDto>;
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
  ) {}

  async getWorkspaceHome(userId: string, loginGeneration = "legacy-session"): Promise<WorkspaceHomeDto> {
    const context = await this.workspaceContextService.getWorkspaceContext(userId);
    if (
      (context.accessState !== "active"
        && context.accessState !== "missing_price_type")
      || !context.companyId
    ) {
      throw new InvalidStateError("Partner workspace access is not active.");
    }

    const [freshness, dashboard, selections, notificationPage, opportunityPage, campaignPage, documentPage, purchasingDynamics] = await Promise.all([
      this.commercialFreshnessReadModel.getFreshness(),
      this.dashboardRepository.getDashboard(context.companyId),
      this.dashboardRepository.getProductSelections?.(userId, context.companyId, loginGeneration) ?? Promise.resolve(null),
      this.notificationRepository?.list(context.companyId, {
        unreadOnly: true,
        pageSize: 8,
      }) ?? Promise.resolve({ items: [], nextCursor: null }),
      this.opportunityRepository?.list({ companyId: context.companyId, filter: "all", limit: 4, offset: 0 })
        ?? Promise.resolve({ items: [], totalCount: 0 }),
      this.campaignRepository?.listPartner({ companyId: context.companyId, filter: "active", limit: 2, offset: 0 })
        ?? Promise.resolve({ items: [], totalCount: 0 }),
      this.documentRepository?.listPartner(context.companyId, { section: "all", state: "current", page: 1, pageSize: 4 })
        ?? Promise.resolve({ items: [], totalCount: 0 }),
      ["partner_owner", "partner_manager", "partner_buyer"].includes(context.membershipRoleCode ?? "")
        ? this.momentumRepository?.getPartnerSummary(context.companyId) ?? Promise.resolve(null)
        : Promise.resolve(null),
    ]);
    const reorderCandidates = selections?.previousProducts ?? dashboard.reorderProducts;
    const merchandisingCandidates = selections?.merchandisingProducts ?? dashboard.merchandisingProducts;
    const candidates = uniqueCandidates([
      ...reorderCandidates,
      ...merchandisingCandidates,
    ]);
    const opportunityProductIds = [...new Set(opportunityPage.items.flatMap((item) => item.product ? [item.product.id] : []))];
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
    const opportunities = enrichOpportunityProductReferences(opportunityPage.items, references);
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
    const directAttentionItems = dashboard.attentionItems.map(toAttentionItem);
    const attentionItems = mergeNotificationAttention(
      directAttentionItems,
      notificationPage.items,
    );

    if (dashboard.financeSummary?.stale) {
      attentionItems.push({
        id: "finance-stale",
        kind: "finance_stale",
        title: "Финансовые данные требуют обновления",
        consequence: "Показаны последние подтверждённые остатки по договорам.",
        href: "/cabinet/finance",
        occurredAt:
          dashboard.financeSummary.lastSuccessfulAt
          ?? new Date(0).toISOString(),
      });
    }
    if (context.accessState === "missing_price_type") {
      attentionItems.push({
        id: "commercial-configuration",
        kind: "commercial_configuration",
        title: "Коммерческие условия ещё не настроены",
        consequence: "Обратитесь к менеджеру Novotech для завершения настройки.",
        href: "/cabinet/company",
        occurredAt: new Date().toISOString(),
      });
    }

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
        })),
      },
      quickActions: buildQuickActions(
        context.capabilities.navigation,
        context.capabilities.canManageCompanyUsers ?? false,
      ),
      continuationItems: dashboard.continuationItems.map(toContinuation),
      reorderProducts: reorderCandidates.flatMap((candidate) => {
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
      }).slice(0, 5),
      merchandisingProducts: merchandisingCandidates.slice(0, 5).map((candidate) => ({
        product: toProduct(candidate, referenceByProduct.get(candidate.id)),
        commercialView: commercialByProduct.get(candidate.id),
      })),
      opportunities,
      campaigns: campaignPage.items,
      recentDocuments: documentPage.items,
      financeSummary: dashboard.financeSummary,
      companySummary: dashboard.companySummary,
      commercialConfigurationMissing: context.accessState === "missing_price_type",
      purchasingDynamics,
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
    };
  }
}

function mergeNotificationAttention(
  direct: WorkspaceAttentionItemDto[],
  notifications: PartnerNotification[],
): WorkspaceAttentionItemDto[] {
  const authoritativeLinks = new Set(direct.map((item) => item.href));
  const notificationItems = notifications
    .filter((item) =>
      !item.readAt
      && (item.severity === "critical" || item.severity === "warning")
      && Boolean(item.actionUrl)
      && !authoritativeLinks.has(item.actionUrl ?? ""),
    )
    .filter((item) =>
      item.eventGroup !== "products"
      || item.eventCode === "cart_product_price_changed"
      || item.eventCode === "cart_product_availability_changed"
    )
    .sort((left, right) => attentionRank(left) - attentionRank(right))
    .map((item) => ({
      id: item.id,
      kind: `notification_${item.eventCode}`,
      title: item.title,
      consequence: item.message,
      href: item.actionUrl ?? "/cabinet/notifications",
      occurredAt: item.occurredAt,
    }));
  return [...notificationItems, ...direct];
}

function severityRank(severity: PartnerNotification["severity"]): number {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function attentionRank(notification: PartnerNotification): number {
  if (
    notification.eventCode === "cart_product_price_changed"
    || notification.eventCode === "cart_product_availability_changed"
  ) {
    return 0;
  }
  return severityRank(notification.severity) + 1;
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
  const orderHref = `/cabinet/orders/${item.objectId}`;
  switch (item.kind) {
    case "portal_order_failure":
      return {
        id: item.id,
        kind: item.kind,
        title: item.objectNumber
          ? `Заказ ${item.objectNumber} требует проверки`
          : "Отправка заказа требует проверки",
        consequence: "Корзина сохранена. Откройте заказ и проверьте статус.",
        href: orderHref,
        occurredAt: item.occurredAt,
      };
    case "shipment_overdue":
      return {
        id: item.id,
        kind: item.kind,
        title: `Отгрузка заказа ${item.objectNumber ?? ""} просрочена`.trim(),
        consequence: "Проверьте текущую дату и при необходимости запросите перенос.",
        href: orderHref,
        occurredAt: item.occurredAt,
      };
    case "shipment_today":
      return {
        id: item.id,
        kind: item.kind,
        title: `Отгрузка заказа ${item.objectNumber ?? ""} запланирована сегодня`.trim(),
        consequence: "Откройте заказ, чтобы проверить позиции и текущий статус.",
        href: orderHref,
        occurredAt: item.occurredAt,
      };
    case "date_change_rejected":
      return {
        id: item.id,
        kind: item.kind,
        title: `Перенос даты по заказу ${item.objectNumber ?? ""} отклонён`.trim(),
        consequence: item.comment || "Откройте заказ для просмотра решения.",
        href: orderHref,
        occurredAt: item.occurredAt,
      };
    case "date_change_pending":
      return {
        id: item.id,
        kind: item.kind,
        title: `Запрос переноса по заказу ${item.objectNumber ?? ""} рассматривается`.trim(),
        consequence: "Novotech проверяет возможность изменения даты отгрузки.",
        href: orderHref,
        occurredAt: item.occurredAt,
      };
    default:
      return {
        id: item.id,
        kind: item.kind,
        title: "Срок приглашения сотрудника скоро истекает",
        consequence: "Проверьте приглашение и при необходимости отправьте его повторно.",
        href: "/cabinet/company/users",
        occurredAt: item.occurredAt,
      };
  }
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

function buildQuickActions(
  navigation: WorkspaceNavigationItem[],
  canManageCompany: boolean,
): WorkspaceQuickActionDto[] {
  const hrefs = new Map(
    navigation.flatMap((item) =>
      item.availability === "available" && item.href
        ? [[item.key, item.href] as const]
        : [],
    ),
  );
  const candidates: Array<readonly [string, string, string | undefined]> = canManageCompany
    ? [
        ["catalog", "Весь каталог", hrefs.get("catalog")],
        ["repeat_order", "Повторить заказ", hrefs.get("orders")],
        ["purchase_templates", "Шаблоны закупок", hrefs.get("purchase_templates")],
        ["estimate", "Создать смету", hrefs.get("proposals")],
        ["orders", "Мои заказы", hrefs.get("orders")],
        ["finance", "Финансы", hrefs.get("finance")],
        ["company_users", "Управление сотрудниками", "/cabinet/company/users"],
      ]
    : [
        ["catalog", "Весь каталог", hrefs.get("catalog")],
        ["repeat_order", "Повторить заказ", hrefs.get("orders")],
        ["purchase_templates", "Шаблоны закупок", hrefs.get("purchase_templates")],
        ["cart", "Открыть корзину", hrefs.get("cart")],
        ["estimate", "Создать смету", hrefs.get("proposals")],
        ["orders", "Мои заказы", hrefs.get("orders")],
        ["shipments", "Планируемые отгрузки", hrefs.get("reservations")],
        ["finance", "Финансы", hrefs.get("finance")],
      ];

  return candidates.flatMap(([key, label, href]) =>
    href ? [{ key, label, href }] : [],
  ).slice(0, 6);
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
