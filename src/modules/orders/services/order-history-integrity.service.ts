import "server-only";

import { createHash } from "node:crypto";

import type { OrderProvider } from "../../integration/contracts";
import type { OrderHistoryIntegrityRepository } from "../repositories";

export class OrderHistoryIntegrityService {
  constructor(
    private readonly repository: OrderHistoryIntegrityRepository,
    private readonly provider: OrderProvider,
  ) {}

  enqueue(companyId: string): Promise<string> {
    return this.repository.enqueue(companyId);
  }

  listAdmin(limit = 25) {
    return this.repository.listAdmin(limit);
  }

  async processOne(): Promise<{ processed: boolean; auditId: string | null; status: string | null; rows: number; hidden: number }> {
    const claim = await this.repository.claim();
    if (!claim) return { processed: false, auditId: null, status: null, rows: 0, hidden: 0 };
    try {
      const result = await this.provider.fetchSalesOrderHistory({
        partnerCompanyReference: {
          providerCode: "one-c",
          externalId: claim.counterpartyRef,
          externalType: "counterparty",
        },
        page: { limit: claim.pageSize, cursor: String(claim.nextSkip) },
        historySyncContext: { syncId: claim.id, page: Math.floor(claim.nextSkip / claim.pageSize) + 1 },
        historyReadMode: "integrity_headers",
      });
      if (result.rejectedRowCount > 0 || result.duplicateRowCount > 0) {
        await this.repository.fail(claim, "Deterministic 1C audit page contained rejected or duplicate identities.", true);
        return { processed: true, auditId: claim.id, status: "integrity_failed", rows: result.items.length, hidden: 0 };
      }
      const rows = result.items.map((order) => ({
        external1cOrderRef: order.reference.externalId.toLowerCase(),
        sourceVersion: order.sourceVersion,
        deletionMark: order.deletionMark,
        documentDate: order.documentDate,
      }));
      const pageFingerprint = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      const stage = await this.repository.stagePage({
        claim,
        pageNumber: Math.floor(claim.nextSkip / claim.pageSize) + 1,
        pageFingerprint,
        rows,
        hasMore: result.nextCursor !== null,
      });
      if (stage === "integrity_failed") {
        return { processed: true, auditId: claim.id, status: stage, rows: rows.length, hidden: 0 };
      }
      if (stage === "continue") {
        return { processed: true, auditId: claim.id, status: "running", rows: rows.length, hidden: 0 };
      }
      const finished = await this.repository.finishPass(claim.id, claim.currentPass);
      return { processed: true, auditId: claim.id, status: finished.status, rows: rows.length, hidden: finished.hidden };
    } catch (error) {
      try {
        await this.repository.fail(
          claim,
          "Order history integrity audit failed before a complete two-pass proof was available.",
          false,
        );
      } catch (coordinationError) {
        console.error({
          event: "partner_order_history_integrity_fail_persistence_failed",
          auditId: claim.id,
          errorType: coordinationError instanceof Error ? coordinationError.name : typeof coordinationError,
        });
      }
      throw error;
    }
  }
}
