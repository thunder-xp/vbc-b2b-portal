import type { OrderHistoryFullAuditAdminItem, OrderHistoryFullAuditClaim } from "../types";

export interface OrderHistoryIntegrityRepository {
  enqueue(companyId: string): Promise<string>;
  listAdmin(limit?: number): Promise<OrderHistoryFullAuditAdminItem[]>;
  claim(): Promise<OrderHistoryFullAuditClaim | null>;
  stagePage(input: {
    claim: OrderHistoryFullAuditClaim;
    pageNumber: number;
    pageFingerprint: string;
    rows: Array<{ external1cOrderRef: string; sourceVersion: string | null; deletionMark: boolean; documentDate: string }>;
    hasMore: boolean;
  }): Promise<"continue" | "pass_complete" | "integrity_failed">;
  finishPass(auditId: string, passNumber: 1 | 2): Promise<{ status: string; hidden: number }>;
  fail(claim: OrderHistoryFullAuditClaim, safeError: string, integrityFailure: boolean): Promise<void>;
}
