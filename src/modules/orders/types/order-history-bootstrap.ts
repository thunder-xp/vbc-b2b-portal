export type OrderHistoryBootstrapStatus =
  | "not_requested"
  | "queued"
  | "running"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
  | "stale";

export type OrderHistoryBootstrapState = {
  status: OrderHistoryBootstrapStatus;
  requestedAt: string | null;
  completedAt: string | null;
  lastErrorCode: string | null;
};

export type OrderHistoryBootstrapClaim = {
  id: string;
  companyId: string;
  counterpartyRef: string;
  lockToken: string;
  historyFrom: string;
  historyTo: string;
};

export type AdminOrderHistoryBootstrapPage = {
  summary: {
    notRequested: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    stale: number;
    oldestPending: string | null;
  };
  items: Array<{
    id: string;
    companyId: string;
    companyName: string;
    status: Exclude<OrderHistoryBootstrapStatus, "not_requested">;
    requestedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    pagesProcessed: number;
    sourceRows: number;
    publishedRows: number;
    rejectedRows: number;
    earliestOrderAt: string | null;
    latestOrderAt: string | null;
    lastErrorCode: string | null;
    lastFullSyncAt: string | null;
    lastIncrementalSyncAt: string | null;
  }>;
};
