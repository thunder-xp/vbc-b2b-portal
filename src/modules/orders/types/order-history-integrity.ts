export type OrderHistoryFullAuditStatus = "queued" | "running" | "succeeded" | "failed" | "integrity_failed";

export type OrderHistoryFullAuditClaim = {
  id: string;
  companyId: string;
  counterpartyRef: string;
  currentPass: 1 | 2;
  nextSkip: number;
  pageSize: number;
  leaseToken: string;
};

export type OrderHistoryFullAuditAdminItem = {
  id: string;
  companyId: string;
  companyName: string;
  status: OrderHistoryFullAuditStatus;
  currentPass: number;
  passOneCount: number | null;
  passTwoCount: number | null;
  hiddenCount: number;
  requestedAt: string;
  finishedAt: string | null;
  safeError: string | null;
};
