import type { SalesOrderHistoryDTO } from "../../integration/dto";
import type { ProductReferenceDto } from "../../catalog/types";
import type { PartnerDocumentListItem } from "../../documents/types";
import type {
  PartnerOrderHistory,
  PartnerOrderHistoryEvent,
  PartnerOrderHistoryItem,
  PartnerOrderHistoryStateCode,
  PartnerOrderHistorySyncMode,
  PartnerOrderHistorySyncState,
  OrderHistoryBootstrapState,
  OrderReorderSource,
} from "../types";

export type PartnerOrderHistoryFilter = "all" | "processing" | PartnerOrderHistoryStateCode;

export type OrderHistoryBatchResult = {
  inserted: number;
  updated: number;
  hidden: number;
};

export type OrderHistorySyncLockResult = "acquired" | "locked" | "stale_lock_recovered";
export type OrderHistorySyncCompany = { companyId: string; counterpartyRef: string };
export type ActiveOrderRefreshCandidate = { order: PartnerOrderHistory; counterpartyRef: string };
export type PartnerOrderHistoryIdentity = {
  external1cOrderRef: string;
  portalOrderId: string | null;
};

export type PartnerOrderHistoryDetailAggregate = {
  order: PartnerOrderHistory;
  companyName: string;
  canViewPartnerPrice: boolean;
  items: PartnerOrderHistoryItem[];
  events: PartnerOrderHistoryEvent[];
  portalSnapshot: {
    documentTotal: number | null;
    currencyCode: string | null;
    items: Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      partnerUnitPrice: number | null;
      lineTotal: number | null;
      currencyCode: string | null;
    }>;
  } | null;
  productReferences: ProductReferenceDto[];
  documents: PartnerDocumentListItem[];
};

export interface PartnerOrderHistoryRepository {
  getReorderSource(orderId: string): Promise<OrderReorderSource | null>;
  getDetailAggregate?(
    orderId: string,
  ): Promise<PartnerOrderHistoryDetailAggregate | null>;
  listPlannedShipments?(input: {
    companyId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: PartnerOrderHistory[]; total: number }>;
  listVisible(input: {
    companyId: string;
    filter: PartnerOrderHistoryFilter;
    search: string | null;
    page?: number;
    pageSize?: number;
    offset?: number;
    limit?: number;
  }): Promise<{ items: PartnerOrderHistory[]; total: number }>;
  listVisibleIdentities?(
    companyId: string,
    candidates?: { external1cRefs: string[]; portalOrderIds: string[] },
  ): Promise<PartnerOrderHistoryIdentity[]>;
  findVisibleById(orderId: string): Promise<PartnerOrderHistory | null>;
  listItemsByOrderIds(orderIds: string[]): Promise<PartnerOrderHistoryItem[]>;
  listEvents(orderId: string): Promise<PartnerOrderHistoryEvent[]>;
  getSyncState(companyId: string): Promise<PartnerOrderHistorySyncState | null>;
  getSyncStateForAutomation?(companyId: string): Promise<PartnerOrderHistorySyncState | null>;
  getBootstrapState?(companyId: string): Promise<OrderHistoryBootstrapState>;
  startSync(input: {
    companyId: string;
    counterpartyRef: string;
    syncId: string;
    mode: PartnerOrderHistorySyncMode;
  }): Promise<OrderHistorySyncLockResult>;
  listSyncCompanies?(limit: number): Promise<OrderHistorySyncCompany[]>;
  listActiveRefreshCandidates?(input: { olderThan: string; limit: number }): Promise<ActiveOrderRefreshCandidate[]>;
  touchSynchronizedOrders?(input: { companyId: string; orderRefs: string[]; syncedAt: string }): Promise<number>;
  upsertBatch(input: {
    companyId: string;
    syncId: string;
    syncedAt: string;
    orders: SalesOrderHistoryDTO[];
  }): Promise<OrderHistoryBatchResult>;
  completeSync(input: {
    companyId: string;
    syncId: string;
    mode: PartnerOrderHistorySyncMode;
    lastSourceVersion: string | null;
    received: number;
    inserted: number;
    updated: number;
    hidden: number;
  }): Promise<void>;
  failSync(input: { companyId: string; syncId: string; safeError: string }): Promise<void>;
}

export class OrderHistoryRepositoryError extends Error {
  constructor() {
    super("Order history persistence failed.");
    this.name = "OrderHistoryRepositoryError";
  }
}
