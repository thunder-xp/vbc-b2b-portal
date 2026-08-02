import type { OrderHistoryBootstrapRepository } from "../repositories";
import type { AdminOrderHistoryBootstrapPage, OrderHistoryBootstrapState } from "../types";
import { OrderHistorySyncError } from "./order-history.errors";
import type { PartnerOrderHistoryService } from "./order-history.service";

export class OrderHistoryBootstrapService {
  constructor(
    private readonly repository: OrderHistoryBootstrapRepository,
    private readonly historyService: PartnerOrderHistoryService,
  ) {}

  ensureFirstAccess(companyId: string, userId: string): Promise<OrderHistoryBootstrapState> {
    return this.repository.ensureFirstAccess(companyId, userId);
  }

  getStatus(companyId: string): Promise<OrderHistoryBootstrapState> {
    return this.repository.getStatus(companyId);
  }

  listAdmin(limit = 50): Promise<AdminOrderHistoryBootstrapPage> {
    return this.repository.listAdmin(limit);
  }

  enqueueAdmin(companyId: string): Promise<OrderHistoryBootstrapState> {
    return this.repository.enqueueAdmin(companyId);
  }

  async processOne(): Promise<{ processed: boolean; bootstrapId: string | null; companyId: string | null }> {
    const claim = await this.repository.claim();
    if (!claim) return { processed: false, bootstrapId: null, companyId: null };
    const startedAt = Date.now();
    try {
      const result = await this.historyService.syncCompany(claim.companyId, claim.counterpartyRef, "full");
      await this.repository.complete(claim, {
        pagesFetched: result.pagesFetched,
        rawReceived: result.rawReceived,
        received: result.received,
        rejected: result.rejected,
      });
      console.info({
        event: "partner_order_history_bootstrap_completed",
        bootstrapId: claim.id,
        companyId: claim.companyId,
        pagesProcessed: result.pagesFetched,
        sourceRows: result.rawReceived,
        publishedRows: result.received,
        rejectedRows: result.rejected,
        durationMs: Date.now() - startedAt,
        deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
      });
      return { processed: true, bootstrapId: claim.id, companyId: claim.companyId };
    } catch (error) {
      const code = error instanceof OrderHistorySyncError ? error.code : error instanceof Error ? error.name : "unknown_error";
      const retryable = code !== "ORDER_HISTORY_COMPANY_MAPPING_MISSING" && code !== "ORDER_HISTORY_HEADER_MAPPING_FAILED";
      await this.repository.fail(claim, code, retryable);
      console.error({
        event: "partner_order_history_bootstrap_failed",
        bootstrapId: claim.id,
        companyId: claim.companyId,
        errorCode: code,
        retryable,
        durationMs: Date.now() - startedAt,
        deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
      });
      throw error;
    }
  }
}
