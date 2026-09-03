import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

export type CommercialReadinessAuditResult = {
  status: "completed" | "no_directory_snapshot";
  syncId?: string;
  selectedCount: number;
  updatedCount?: number;
  candidateSelectionMs?: number;
  reconciliationMs?: number;
  perCompanyReconciliationMs?: number;
  totalMs?: number;
  totalOrderCapable?: number;
  ready?: number;
  repairableRemaining?: number;
  irreparable?: number;
  noPaymentPath?: number;
  neverVerified?: number;
  stillMismatch?: number;
  blockedWithNonEmptyCart?: number;
  issues?: Array<{
    companyId: string;
    companyName: string;
    readinessClass: string;
    paymentPathClass: string;
    severity: "high" | "medium" | "low";
    activeCartItemCount: number;
    lastVerifiedAt: string | null;
    commercialConsequence: string;
    requiredAction: string;
  }>;
};

export class CommercialReadinessAuditService {
  async run(limit = 100): Promise<CommercialReadinessAuditResult> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const { data, error } = await createAdminClient().rpc(
      "run_partner_commercial_readiness_safety_net",
      { p_limit: boundedLimit },
    );
    if (error || !isAuditResult(data)) {
      throw new Error(`Commercial readiness audit failed (${error?.code || "INVALID_RESULT"}).`);
    }
    return data;
  }
}

function isAuditResult(value: unknown): value is CommercialReadinessAuditResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CommercialReadinessAuditResult>;
  return (candidate.status === "completed" || candidate.status === "no_directory_snapshot")
    && typeof candidate.selectedCount === "number";
}
