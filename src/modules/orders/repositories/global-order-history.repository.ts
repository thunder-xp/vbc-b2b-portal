import type {
  GlobalSalesOrderHistoryHeaderDTO,
  GlobalSalesOrderHistoryItemDTO,
} from "../../integration/dto";

export type GlobalOrderHistoryCheckpoint = {
  status: "running" | "locked" | "completed";
  phase: "headers" | "items" | "completed" | null;
  lockToken: string | null;
  headerCursor: string;
  itemCursor: string;
};

export type GlobalOrderHistorySyncSummary = {
  status: string;
  phase: string;
  headerPages: number;
  itemPages: number;
  headersScanned: number;
  itemsScanned: number;
  eligibleB2bOrders: number;
  eligibleB2bItems: number;
  ordersInserted: number;
  ordersUpdated: number;
  itemsUpserted: number;
  sourceOldestOrder: string | null;
  sourceNewestOrder: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
};

export interface GlobalOrderHistoryRepository {
  acquire(restart?: boolean): Promise<GlobalOrderHistoryCheckpoint>;
  persistHeaderPage(input: {
    lockToken: string;
    cursor: string;
    nextCursor: string;
    hasMore: boolean;
    headers: GlobalSalesOrderHistoryHeaderDTO[];
    counterpartyMetrics: Record<string, unknown>;
  }): Promise<{ inserted: number; updated: number; eligible: number; nextPhase: "headers" | "items" }>;
  persistItemPage(input: {
    lockToken: string;
    cursor: string;
    nextCursor: string;
    hasMore: boolean;
    items: GlobalSalesOrderHistoryItemDTO[];
  }): Promise<{ upserted: number; eligible: number; completed: boolean }>;
  release(lockToken: string): Promise<void>;
  fail(lockToken: string, safeError: string): Promise<void>;
  getSummary(): Promise<GlobalOrderHistorySyncSummary>;
}

export class GlobalOrderHistoryRepositoryError extends Error {
  constructor() {
    super("Global order-history persistence failed.");
    this.name = "GlobalOrderHistoryRepositoryError";
  }
}
