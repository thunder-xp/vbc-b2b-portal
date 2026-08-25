import "server-only";

import type {
  OrderReconciliationAttemptResult,
  OrderReconciliationRepository,
} from "../repositories";
import { PartnerOrderIntegrationStatus, PartnerOrderStatus, type PartnerOrder } from "../types";

const BATCH_LIMIT = 5;
const LEASE_SECONDS = 180;
const CONCURRENCY = 2;

type ReconciliationService = {
  reconcileInternal(orderId: string): Promise<PartnerOrder>;
};

export class OrderReconciliationWorkerService {
  constructor(
    private readonly repository: OrderReconciliationRepository,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  async processBatch(limit = BATCH_LIMIT) {
    const startedAt = performance.now();
    const claims = await this.repository.claim(Math.min(BATCH_LIMIT, Math.max(1, limit)), LEASE_SECONDS);
    const results: Array<{ result: OrderReconciliationAttemptResult }> = [];

    for (let index = 0; index < claims.length; index += CONCURRENCY) {
      results.push(...await Promise.all(
        claims.slice(index, index + CONCURRENCY).map((claim) => this.processClaim(claim)),
      ));
    }

    return {
      claimed: claims.length,
      confirmed: results.filter((item) => item.result === "confirmed").length,
      confirmedNotCreated: results.filter((item) => item.result === "confirmed_not_created").length,
      manualReviewRequired: results.filter((item) => item.result === "manual_review_required").length,
      retryScheduled: results.filter((item) => item.result === "retry_scheduled").length,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  private async processClaim(claim: {
    orderId: string;
    correlationId: string;
    attemptNumber: number;
  }): Promise<{ result: OrderReconciliationAttemptResult }> {
    try {
      const order = await this.reconciliationService.reconcileInternal(claim.orderId);
      const result = classifyResult(order);
      await this.repository.finish({
        orderId: claim.orderId,
        correlationId: claim.correlationId,
        result,
      });
      return { result };
    } catch (error) {
      const retryAfterSeconds = Math.min(3600, 30 * (2 ** Math.min(6, claim.attemptNumber - 1)));
      await this.repository.finish({
        orderId: claim.orderId,
        correlationId: claim.correlationId,
        result: "retry_scheduled",
        safeErrorCode: safeErrorCode(error),
        retryAfterSeconds,
      });
      return { result: "retry_scheduled" };
    }
  }
}

function classifyResult(order: PartnerOrder): OrderReconciliationAttemptResult {
  if (
    order.status === PartnerOrderStatus.Submitted &&
    order.integrationStatus === PartnerOrderIntegrationStatus.Confirmed
  ) return "confirmed";
  if (order.integrationStatus === PartnerOrderIntegrationStatus.ConfirmedNotCreated) {
    return "confirmed_not_created";
  }
  if (order.integrationStatus === PartnerOrderIntegrationStatus.ManualReviewRequired) {
    return "manual_review_required";
  }
  throw new Error("ORDER_RECONCILIATION_RESULT_UNRESOLVED");
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z0-9_]{2,80}$/.test(error.message)) return error.message;
  return "ORDER_RECONCILIATION_PROVIDER_UNAVAILABLE";
}
