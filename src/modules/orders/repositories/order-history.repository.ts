import type { SalesOrderHistoryDTO } from "../../integration/dto";
import type {
  PartnerOrderHistory,
  PartnerOrderHistoryEvent,
  PartnerOrderHistoryItem,
  PartnerOrderHistoryStateCode,
  PartnerOrderHistorySyncMode,
  PartnerOrderHistorySyncState,
} from "../types";

export type PartnerOrderHistoryFilter = "all" | "processing" | PartnerOrderHistoryStateCode;

export type OrderHistoryBatchResult = {
  inserted: number;
  updated: number;
  hidden: number;
};

export interface PartnerOrderHistoryRepository {
  listVisible(input: {
    companyId: string;
    filter: PartnerOrderHistoryFilter;
    search: string | null;
    page: number;
    pageSize: number;
  }): Promise<{ items: PartnerOrderHistory[]; total: number }>;
  findVisibleById(orderId: string): Promise<PartnerOrderHistory | null>;
  listItemsByOrderIds(orderIds: string[]): Promise<PartnerOrderHistoryItem[]>;
  listEvents(orderId: string): Promise<PartnerOrderHistoryEvent[]>;
  getSyncState(companyId: string): Promise<PartnerOrderHistorySyncState | null>;
  startSync(input: {
    companyId: string;
    counterpartyRef: string;
    syncId: string;
    mode: PartnerOrderHistorySyncMode;
  }): Promise<void>;
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
