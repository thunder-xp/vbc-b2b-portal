import "server-only";

import type { FinalCustomerProvisioningRepository } from "./repository";
import { isNewPurchaseProvisioningEnabled } from "./flags";

const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 20;
const CONCURRENCY = 4;

export class FinalCustomerProvisioningService {
  constructor(private readonly repository: FinalCustomerProvisioningRepository) {}

  async processBatch(limit = DEFAULT_BATCH_LIMIT) {
    const startedAt = performance.now();
    if (!isNewPurchaseProvisioningEnabled()) {
      return { enabled: false, claimed: 0, created: 0, reused: 0, needsReview: 0, retryScheduled: 0, durationMs: 0 };
    }

    const claims = await this.repository.claim(Math.min(MAX_BATCH_LIMIT, Math.max(1, limit)));
    const outcomes: Array<"CREATED" | "REUSED" | "NEEDS_REVIEW" | "RETRY_SCHEDULED"> = [];
    for (let index = 0; index < claims.length; index += CONCURRENCY) {
      outcomes.push(...await Promise.all(claims.slice(index, index + CONCURRENCY).map(async (claim) => {
        try {
          return (await this.repository.provision(claim)).outcome;
        } catch (error) {
          await this.repository.fail(claim, safeErrorCode(error));
          return "RETRY_SCHEDULED" as const;
        }
      })));
    }
    return {
      enabled: true,
      claimed: claims.length,
      created: outcomes.filter((outcome) => outcome === "CREATED").length,
      reused: outcomes.filter((outcome) => outcome === "REUSED").length,
      needsReview: outcomes.filter((outcome) => outcome === "NEEDS_REVIEW").length,
      retryScheduled: outcomes.filter((outcome) => outcome === "RETRY_SCHEDULED").length,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}

function safeErrorCode(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code ?? "") : "";
  return /^[A-Z0-9_]{2,80}$/.test(code) ? code : "CUSTOMER_PROVISIONING_RETRYABLE";
}
