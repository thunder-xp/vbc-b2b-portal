import type { ExchangeRateProvider, OneCCommercialRateSnapshot } from "../providers/one-c";

export type CommercialRateSyncResult = {
  outcome: "published" | "no_op";
  publishedCount: number;
  checkedAt: string;
  rates: Array<{ id: string; purpose: string; rate: number; source_data_version: string }>;
};

export interface ExchangeRatePublisher {
  start(correlationId: string, attemptedAt: string): Promise<void>;
  publish(snapshot: OneCCommercialRateSnapshot, correlationId: string): Promise<CommercialRateSyncResult>;
  fail(correlationId: string, errorCode: string, failedAt: string): Promise<void>;
}

export class ExchangeRateSyncService {
  constructor(private readonly provider: ExchangeRateProvider, private readonly publisher: ExchangeRatePublisher) {}

  async sync(correlationId = crypto.randomUUID()): Promise<CommercialRateSyncResult> {
    const attemptedAt = new Date().toISOString();
    await this.publisher.start(correlationId, attemptedAt);
    try {
      const snapshot = await this.provider.fetchCommercialRates();
      return await this.publisher.publish(snapshot, correlationId);
    } catch (error) {
      const errorCode = error instanceof Error && "category" in error && typeof error.category === "string"
        ? `ONE_C_${error.category}`
        : "COMMERCIAL_RATE_SYNC_FAILED";
      try { await this.publisher.fail(correlationId, errorCode, new Date().toISOString()); } catch { /* preserve source failure */ }
      throw error;
    }
  }
}
