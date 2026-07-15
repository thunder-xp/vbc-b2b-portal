import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { OrderProvider } from "../../integration/contracts";
import type {
  PartnerOrderHistoryFilter,
  PartnerOrderHistoryRepository,
  PartnerOrderRepository,
} from "../repositories";
import type {
  PartnerOrderHistory,
  PartnerOrderHistoryEvent,
  PartnerOrderHistoryItem,
  PartnerOrderHistorySyncMode,
  PartnerOrderHistorySyncState,
} from "../types";

const ORDERS_VIEW_PERMISSION = "orders.view";
const ORDERS_MANAGE_PERMISSION = "orders.manage";
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const LIST_PAGE_SIZE = 25;

const STATE_LABELS = {
  open: "Открыт",
  preorder: "Предзаказ",
  test: "Тест",
  completed: "Завершен",
} as const;

export type PartnerOrderHistorySummaryDto = {
  id: string;
  primaryLabel: string;
  statusLabel: string;
  posted: boolean;
  documentDate: string;
  deliveryDate: string | null;
  documentTotal: string;
  positionCount: number;
  totalUnitCount: number;
  lastSynchronizedAt: string;
};

export type PartnerOrderHistoryDetailDto = PartnerOrderHistorySummaryDto & {
  companyName: string;
  originLabel: string | null;
  lines: Array<{
    productName: string;
    sku: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  timeline: Array<{ label: string; occurredAt: string }>;
  portalSnapshot: {
    total: string;
    lines: Array<{ productName: string; sku: string; quantity: number; unitPrice: string; lineTotal: string }>;
  } | null;
};

export type PartnerOrderHistorySyncResult = {
  syncId: string;
  received: number;
  inserted: number;
  updated: number;
  hidden: number;
};

export interface PartnerOrderHistoryService {
  list(userId: string, input: { filter?: string | null; search?: string | null; page?: number | string | null }): Promise<{
    orders: PartnerOrderHistorySummaryDto[];
    filter: PartnerOrderHistoryFilter;
    search: string;
    page: number;
    totalPages: number;
    total: number;
    syncState: PartnerOrderHistorySyncState | null;
  }>;
  get(userId: string, orderId: string): Promise<PartnerOrderHistoryDetailDto>;
  syncOwnCompany(userId: string, mode: PartnerOrderHistorySyncMode): Promise<PartnerOrderHistorySyncResult>;
}

export class DefaultPartnerOrderHistoryService implements PartnerOrderHistoryService {
  constructor(
    private readonly historyRepository: PartnerOrderHistoryRepository,
    private readonly portalOrderRepository: PartnerOrderRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly orderProvider: OrderProvider,
  ) {}

  async list(userId: string, input: { filter?: string | null; search?: string | null; page?: number | string | null }) {
    const context = await this.resolveContext(userId, ORDERS_VIEW_PERMISSION);
    const filter = parseFilter(input.filter);
    const search = normalizeSearch(input.search);
    const page = parsePage(input.page);
    const [result, syncState] = await Promise.all([
      this.historyRepository.listVisible({ companyId: context.company.id, filter, search: search || null, page, pageSize: LIST_PAGE_SIZE }),
      this.historyRepository.getSyncState(context.company.id),
    ]);
    return {
      orders: result.items.map(toSummary),
      filter,
      search,
      page,
      totalPages: Math.max(1, Math.ceil(result.total / LIST_PAGE_SIZE)),
      total: result.total,
      syncState,
    };
  }

  async get(userId: string, orderId: string): Promise<PartnerOrderHistoryDetailDto> {
    const context = await this.resolveContext(userId, ORDERS_VIEW_PERMISSION);
    const order = await this.historyRepository.findVisibleById(requirePortalUuid(orderId));
    if (!order || order.companyId !== context.company.id || order.oneCDeletionMark || !order.partnerVisible) {
      throw new NotFoundError("Order was not found.");
    }
    const [items, events, portalSnapshot] = await Promise.all([
      this.historyRepository.listItemsByOrderIds([order.id]),
      this.historyRepository.listEvents(order.id),
      this.loadPortalSnapshot(order),
    ]);
    return {
      ...toSummary(order),
      companyName: context.company.displayName,
      originLabel: order.originType === "partner_platform" ? null : "Заказ из истории Novotech",
      lines: items.map(toDetailLine),
      timeline: events.map(toTimelineEvent),
      portalSnapshot,
    };
  }

  async syncOwnCompany(userId: string, mode: PartnerOrderHistorySyncMode): Promise<PartnerOrderHistorySyncResult> {
    const context = await this.resolveContext(userId, ORDERS_MANAGE_PERMISSION);
    const counterpartyRef = context.company.external1cId?.trim();
    if (!counterpartyRef) throw new InvalidStateError("Company is not linked to 1C.");
    const current = await this.historyRepository.getSyncState(context.company.id);
    if (current?.status === "running") throw new InvalidStateError("Order history synchronization is already running.");
    const effectiveMode: PartnerOrderHistorySyncMode = current?.lastSuccessfulFullSyncAt ? mode : "full";

    const syncId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    await this.historyRepository.startSync({ companyId: context.company.id, counterpartyRef, syncId, mode: effectiveMode });
    let cursor: string | null = null;
    let page = 0;
    let received = 0;
    let inserted = 0;
    let updated = 0;
    let hidden = 0;
    let lastSourceVersion: string | null = null;

    try {
      do {
        if (page >= MAX_PAGES) throw new Error("1C order history exceeded the safe page limit.");
        const result = await this.orderProvider.fetchSalesOrderHistory({
          partnerCompanyReference: { providerCode: "one-c", externalId: counterpartyRef, externalType: "counterparty" },
          page: { limit: PAGE_SIZE, cursor },
        });
        const batch = await this.historyRepository.upsertBatch({
          companyId: context.company.id,
          syncId,
          syncedAt: startedAt,
          orders: result.items,
        });
        received += result.items.length;
        inserted += batch.inserted;
        updated += batch.updated;
        hidden += batch.hidden;
        lastSourceVersion = result.items.at(-1)?.sourceVersion ?? lastSourceVersion;
        cursor = result.nextCursor;
        page += 1;
      } while (cursor !== null);

      await this.historyRepository.completeSync({
        companyId: context.company.id,
        syncId,
        mode: effectiveMode,
        lastSourceVersion,
        received,
        inserted,
        updated,
        hidden,
      });
      return { syncId, received, inserted, updated, hidden };
    } catch (error) {
      await this.historyRepository.failSync({
        companyId: context.company.id,
        syncId,
        safeError: "Не удалось обновить историю заказов. Ранее загруженные данные сохранены.",
      });
      throw error;
    }
  }

  private async loadPortalSnapshot(order: PartnerOrderHistory) {
    if (!order.portalOrderId) return null;
    const portalOrder = await this.portalOrderRepository.findById(order.portalOrderId);
    if (!portalOrder) return null;
    const items = await this.portalOrderRepository.listItems(portalOrder.id);
    const currency = portalOrder.currencyCode ?? items[0]?.currencyCode ?? null;
    if (!currency) return null;
    const total = portalOrder.documentTotal ?? items.reduce((sum, item) => sum + item.lineTotal, 0);
    return {
      total: formatMoney(total, currency),
      lines: items.map((item) => ({
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: formatMoney(item.partnerUnitPrice, item.currencyCode),
        lineTotal: formatMoney(item.lineTotal, item.currencyCode),
      })),
    };
  }

  private async resolveContext(userId: string, permission: string) {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissionService.ensurePermission(userId, context.company.id, permission);
    return context;
  }
}

function toSummary(order: PartnerOrderHistory): PartnerOrderHistorySummaryDto {
  return {
    id: order.id,
    primaryLabel: order.oneCPosted && order.external1cOrderNumber
      ? `№ ${order.external1cOrderNumber}`
      : "Заказ обрабатывается",
    statusLabel: order.oneCPosted
      ? order.oneCStateCode ? STATE_LABELS[order.oneCStateCode] : "Статус уточняется"
      : "Обрабатывается",
    posted: order.oneCPosted,
    documentDate: order.oneCDocumentDate,
    deliveryDate: order.oneCDeliveryDate,
    documentTotal: order.currencyCode
      ? formatMoney(order.documentTotal, order.currencyCode)
      : `${formatNumber(order.documentTotal)} · валюта уточняется`,
    positionCount: order.positionCount,
    totalUnitCount: order.totalUnitCount,
    lastSynchronizedAt: order.oneCLastSyncedAt,
  };
}

function toDetailLine(item: PartnerOrderHistoryItem) {
  return {
    productName: item.productName ?? "Товар из истории 1С",
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: item.currencyCode ? formatMoney(item.unitPrice, item.currencyCode) : formatNumber(item.unitPrice),
    lineTotal: item.currencyCode ? formatMoney(item.lineTotal, item.currencyCode) : formatNumber(item.lineTotal),
  };
}

function toTimelineEvent(event: PartnerOrderHistoryEvent) {
  const labels: Record<PartnerOrderHistoryEvent["eventType"], string> = {
    imported: "Импортирован из истории 1С",
    received_by_one_c: "Заказ получен 1С",
    posted: "Документ проведён",
    became_unposted: "Документ снят с проведения",
    state_changed: "Состояние заказа изменено",
    delivery_date_changed: "Дата отгрузки изменена",
    sync_restored: "Синхронизация восстановлена",
  };
  return { label: labels[event.eventType], occurredAt: event.occurredAt };
}

function parseFilter(value: string | null | undefined): PartnerOrderHistoryFilter {
  return value === "processing" || value === "open" || value === "preorder" || value === "test" || value === "completed"
    ? value
    : "all";
}

function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 100);
}

function parsePage(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function requirePortalUuid(value: string): string {
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new NotFoundError("Order was not found.");
  }
  return normalized.toLowerCase();
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount);
}

function formatNumber(amount: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount);
}
