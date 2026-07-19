import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { OrderProvider } from "../../integration/contracts";
import type { SalesOrderHistoryDTO } from "../../integration/dto";
import { evaluateFreshness, type FreshnessView } from "../../integration/freshness";
import type {
  PartnerOrderHistoryFilter,
  PartnerOrderHistoryRepository,
  PartnerOrderRepository,
  OrderDateChangeRequestRepository,
} from "../repositories";
import { OrderDateChangeRepositoryError } from "../repositories/order-date-change.repository";
import type {
  OrderDateChangeRequest,
  OrderDateChangeRequestStatus,
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
const PLANNED_SHIPMENT_PAGE_SIZE = 20;

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
  freshness: FreshnessView;
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

export type PlannedShipmentIndicator = "scheduled" | "soon" | "today" | "overdue";

export type PlannedShipmentDto = PartnerOrderHistorySummaryDto & {
  daysRemaining: number;
  dateIndicator: PlannedShipmentIndicator;
  dateIndicatorLabel: string;
  dateChangeRequest: {
    id: string;
    requestedDate: string;
    status: OrderDateChangeRequestStatus;
    statusLabel: string;
    awaitingOneC: boolean;
    reviewComment: string | null;
  } | null;
};

export type PartnerOrderHistorySyncResult = {
  syncId: string;
  pagesFetched: number;
  rowsPerPage: number[];
  rawReceived: number;
  received: number;
  duplicatesIgnored: number;
  linesFetched: number;
  rejected: number;
  inserted: number;
  updated: number;
  hidden: number;
  enrichmentWarnings: number;
};

export interface PartnerOrderHistoryService {
  listPlannedShipments(userId: string, input?: { page?: number | string | null }): Promise<{
    shipments: PlannedShipmentDto[];
    page: number;
    totalPages: number;
    total: number;
  }>;
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
  syncCompany(companyId: string, counterpartyRef: string, mode: PartnerOrderHistorySyncMode): Promise<PartnerOrderHistorySyncResult>;
  createDateChangeRequest(userId: string, orderHistoryId: string, requestedDate: string, comment: string): Promise<OrderDateChangeRequest>;
  cancelDateChangeRequest(userId: string, requestId: string): Promise<OrderDateChangeRequest>;
}

export class DefaultPartnerOrderHistoryService implements PartnerOrderHistoryService {
  constructor(
    private readonly historyRepository: PartnerOrderHistoryRepository,
    private readonly portalOrderRepository: PartnerOrderRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly orderProvider: OrderProvider,
    private readonly dateChangeRepository?: OrderDateChangeRequestRepository,
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
      freshness: evaluateFreshness(syncState?.finishedAt ?? syncState?.lastIncrementalSyncAt ?? syncState?.lastSuccessfulFullSyncAt, "activeOrder", "Заказы"),
    };
  }

  async listPlannedShipments(userId: string, input: { page?: number | string | null } = {}) {
    const context = await this.resolveContext(userId, ORDERS_VIEW_PERMISSION);
    if (!this.historyRepository.listPlannedShipments) throw new InvalidStateError("Planned shipments are unavailable.");
    const page = parsePage(input.page);
    const result = await this.historyRepository.listPlannedShipments({
      companyId: context.company.id,
      page,
      pageSize: PLANNED_SHIPMENT_PAGE_SIZE,
    });
    const requests = this.dateChangeRepository
      ? await this.dateChangeRepository.listLatestByOrderIds(result.items.map((order) => order.id))
      : new Map();
    return {
      shipments: result.items.map((order) => {
        const summary = toSummary(order);
        const indicator = getPlannedShipmentIndicator(order.oneCDeliveryDate!);
        const request = requests.get(order.id);
        return { ...summary, ...indicator, dateChangeRequest: request ? {
          id: request.id,
          requestedDate: request.requestedDate,
          status: request.status,
          statusLabel: dateChangeStatusLabel(request.status),
          awaitingOneC: request.status === "approved" && !request.synchronizedAt && request.requestedDate !== order.oneCDeliveryDate,
          reviewComment: request.reviewComment,
        } : null };
      }),
      page,
      totalPages: Math.max(1, Math.ceil(result.total / PLANNED_SHIPMENT_PAGE_SIZE)),
      total: result.total,
    };
  }

  async createDateChangeRequest(userId: string, orderHistoryId: string, requestedDate: string, comment: string) {
    const context = await this.resolveContext(userId, ORDERS_MANAGE_PERMISSION);
    if (!this.dateChangeRepository) throw new InvalidStateError("Date-change requests are unavailable.");
    const order = await this.historyRepository.findVisibleById(requirePortalUuid(orderHistoryId));
    if (!order || order.companyId !== context.company.id || order.oneCDeletionMark || !order.partnerVisible || order.oneCStateCode === "completed" || !order.oneCDeliveryDate) throw new NotFoundError("Order was not found.");
    const date = normalizeRequestedDate(requestedDate);
    if (date === order.oneCDeliveryDate) throw new InvalidStateError("Choose a date different from the current shipment date.");
    const normalizedComment = comment.trim();
    if (normalizedComment.length > 1000) throw new InvalidStateError("Comment is too long.");
    try {
      return await this.dateChangeRepository.create({ orderHistoryId: order.id, requestedDate: date, comment: normalizedComment || null });
    } catch (error) {
      if (error instanceof OrderDateChangeRepositoryError && error.code === "23505") {
        throw new InvalidStateError("A pending date-change request already exists.");
      }
      throw error;
    }
  }

  async cancelDateChangeRequest(userId: string, requestId: string) {
    await this.resolveContext(userId, ORDERS_MANAGE_PERMISSION);
    if (!this.dateChangeRepository) throw new InvalidStateError("Date-change requests are unavailable.");
    return this.dateChangeRepository.cancel(requirePortalUuid(requestId));
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
    return this.syncCompany(context.company.id, counterpartyRef, mode);
  }

  async syncCompany(companyId: string, counterpartyRef: string, mode: PartnerOrderHistorySyncMode): Promise<PartnerOrderHistorySyncResult> {
    const context = { company: { id: companyId } };
    const current = this.historyRepository.getSyncStateForAutomation
      ? await this.historyRepository.getSyncStateForAutomation(context.company.id)
      : await this.historyRepository.getSyncState(context.company.id);
    const effectiveMode: PartnerOrderHistorySyncMode = current?.lastSuccessfulFullSyncAt ? mode : "full";

    const syncId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const lockResult = await this.historyRepository.startSync({ companyId: context.company.id, counterpartyRef, syncId, mode: effectiveMode });
    if (lockResult === "locked") throw new InvalidStateError("Order history synchronization is already running.");
    console.info({
      event: lockResult === "stale_lock_recovered" ? "stale_lock_recovered" : "partner_order_history_sync_started",
      syncId,
      companyId: context.company.id,
      counterpartyRef,
      mode: effectiveMode,
      startedAt,
    });
    let cursor: string | null = null;
    let page = 0;
    let received = 0;
    let inserted = 0;
    let updated = 0;
    let hidden = 0;
    let lastSourceVersion: string | null = null;
    let rawReceived = 0;
    let duplicatesIgnored = 0;
    let linesFetched = 0;
    let rejected = 0;
    let enrichmentWarnings = 0;
    let lastCommittedPage = 0;
    const rowsPerPage: number[] = [];
    const seenOrders = new Map<string, SalesOrderHistoryDTO>();
    const deferredDeletedOrders: SalesOrderHistoryDTO[] = [];

    try {
      do {
        if (page >= MAX_PAGES) throw new Error("1C order history exceeded the safe page limit.");
        console.info({ event: "partner_order_history_sync_page_started", syncId, page: page + 1, cursor, top: PAGE_SIZE });
        const result = await this.orderProvider.fetchSalesOrderHistory({
          partnerCompanyReference: { providerCode: "one-c", externalId: counterpartyRef, externalType: "counterparty" },
          page: { limit: PAGE_SIZE, cursor },
          historySyncContext: { syncId, page: page + 1 },
        });
        rawReceived += result.rawRowCount;
        linesFetched += result.lineRowCount;
        rejected += result.rejectedRowCount;
        enrichmentWarnings += result.enrichmentWarningCount;
        rowsPerPage.push(result.rawRowCount);
        const uniquePageOrders: SalesOrderHistoryDTO[] = [];
        for (const order of result.items) {
          const reference = order.reference.externalId.toLowerCase();
          const existing = seenOrders.get(reference);
          if (existing) {
            duplicatesIgnored += 1;
            if (!sameHistoryRecord(existing, order)) {
              throw new Error("1C returned conflicting versions of the same order during an unordered scan.");
            }
            continue;
          }
          seenOrders.set(reference, order);
          uniquePageOrders.push(order);
        }
        duplicatesIgnored += result.duplicateRowCount;
        if (result.rawRowCount > 0 && uniquePageOrders.length === 0) {
          throw new Error("1C order history pagination repeated a page without new order references.");
        }
        const visibleOrders = uniquePageOrders.filter((order) => !order.deletionMark);
        deferredDeletedOrders.push(...uniquePageOrders.filter((order) => order.deletionMark));
        const batch = visibleOrders.length > 0
          ? await this.historyRepository.upsertBatch({
              companyId: context.company.id,
              syncId,
              syncedAt: startedAt,
              orders: visibleOrders,
            })
          : { inserted: 0, updated: 0, hidden: 0 };
        lastCommittedPage = page + 1;
        console.info({
          event: "partner_order_history_sync_page_persisted",
          syncId,
          page: page + 1,
          cursor,
          rowsReceived: result.rawRowCount,
          uniqueRowsReceived: uniquePageOrders.length,
          duplicatesIgnored: result.duplicateRowCount + (result.items.length - uniquePageOrders.length),
          lineRowsReceived: result.lineRowCount,
          inserted: batch.inserted,
          updated: batch.updated,
          hidden: batch.hidden,
          enrichmentWarnings: result.enrichmentWarningCount,
          committed: visibleOrders.length > 0,
          nextCursor: result.nextCursor,
        });
        received += uniquePageOrders.length;
        inserted += batch.inserted;
        updated += batch.updated;
        hidden += batch.hidden;
        lastSourceVersion = result.items.at(-1)?.sourceVersion ?? lastSourceVersion;
        cursor = result.nextCursor;
        page += 1;
      } while (cursor !== null);

      if (deferredDeletedOrders.length > 0) {
        const deletionBatch = await this.historyRepository.upsertBatch({
          companyId: context.company.id,
          syncId,
          syncedAt: startedAt,
          orders: deferredDeletedOrders,
        });
        inserted += deletionBatch.inserted;
        updated += deletionBatch.updated;
        hidden += deletionBatch.hidden;
      }

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
      console.info({ event: "partner_order_history_sync_completed", syncId, pages: page, rowsPerPage, rawReceived, received, duplicatesIgnored, linesFetched, rejected, inserted, updated, hidden, enrichmentWarnings });
      return { syncId, pagesFetched: page, rowsPerPage, rawReceived, received, duplicatesIgnored, linesFetched, rejected, inserted, updated, hidden, enrichmentWarnings };
    } catch (error) {
      console.error({
        event: "partner_order_history_sync_failed",
        syncId,
        companyId: context.company.id,
        counterpartyRef,
        page: page + 1,
        cursor,
        top: PAGE_SIZE,
        received,
        inserted,
        updated,
        hidden,
        rawReceived,
        uniqueReceived: received,
        duplicatesIgnored,
        linesFetched,
        rejected,
        enrichmentWarnings,
        lastCommittedPage,
        deletionRowsDeferred: deferredDeletedOrders.length,
        errorType: error?.constructor?.name ?? typeof error,
        errorName: error instanceof Error ? error.name : null,
        errorMessage: error instanceof Error ? error.message : null,
      });
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
    freshness: evaluateFreshness(order.oneCLastSyncedAt, "activeOrder", "Обновлено"),
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

function sameHistoryRecord(left: SalesOrderHistoryDTO, right: SalesOrderHistoryDTO): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

export function getPlannedShipmentIndicator(deliveryDate: string, now = new Date()): Pick<PlannedShipmentDto, "daysRemaining" | "dateIndicator" | "dateIndicatorLabel"> {
  const currentDate = dateInTimeZone(now, "Europe/Chisinau");
  const daysRemaining = Math.round((Date.parse(`${deliveryDate}T00:00:00Z`) - Date.parse(`${currentDate}T00:00:00Z`)) / 86_400_000);
  if (daysRemaining < 0) return { daysRemaining, dateIndicator: "overdue", dateIndicatorLabel: "Дата прошла" };
  if (daysRemaining === 0) return { daysRemaining, dateIndicator: "today", dateIndicatorLabel: "Сегодня" };
  if (daysRemaining <= 3) return { daysRemaining, dateIndicator: "soon", dateIndicatorLabel: "Скоро отгрузка" };
  return { daysRemaining, dateIndicator: "scheduled", dateIndicatorLabel: "Запланировано" };
}

function dateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function normalizeRequestedDate(value: string): string {
  const normalized = value.trim();
  const today = dateInTimeZone(new Date(), "Europe/Chisinau");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(Date.parse(`${normalized}T00:00:00Z`)) || normalized <= today) throw new InvalidStateError("Choose a future date.");
  return normalized;
}

function dateChangeStatusLabel(status: OrderDateChangeRequestStatus) { return ({ pending: "На рассмотрении", approved: "Одобрено", rejected: "Отклонено", cancelled: "Отменено" } as const)[status]; }
