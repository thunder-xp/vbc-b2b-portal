import { createAdminClient } from "@/src/lib/supabase/admin";

import type { OneCCommercialRateSnapshot } from "../providers/one-c";
import type { CommercialRateSyncResult, ExchangeRatePublisher } from "./exchange-rate-sync";

export class SupabaseExchangeRatePublisher implements ExchangeRatePublisher {
  async start(correlationId: string, attemptedAt: string): Promise<void> {
    const { error } = await createAdminClient().rpc("start_automatic_commercial_rate_sync", {
      p_correlation_id: correlationId,
      p_attempted_at: attemptedAt,
    });
    if (error) throw new Error("Commercial-rate sync state could not be started.");
  }

  async publish(snapshot: OneCCommercialRateSnapshot, correlationId: string): Promise<CommercialRateSyncResult> {
    const { data, error } = await createAdminClient().rpc("publish_automatic_commercial_rates", {
      p_rates: snapshot.rates.map((rate) => ({
        purpose: rate.purpose,
        currency_ref: rate.currencyReference,
        code: rate.code,
        symbolic_code: rate.symbolicCode,
        raw_rate: rate.rate,
        multiplicity: rate.multiplicity,
        normalized_rate: rate.normalizedRate,
        effective_at: rate.effectiveAt,
        data_version: rate.dataVersion,
      })),
      p_checked_at: snapshot.generatedAt,
      p_correlation_id: correlationId,
    });
    if (error || !isSyncResult(data)) throw new Error("Automatic commercial-rate publication failed.");
    return data;
  }

  async fail(correlationId: string, errorCode: string, failedAt: string): Promise<void> {
    const { error } = await createAdminClient().rpc("fail_automatic_commercial_rate_sync", {
      p_correlation_id: correlationId,
      p_error_code: errorCode,
      p_failed_at: failedAt,
    });
    if (error) throw new Error("Commercial-rate failure state could not be recorded.");
  }
}

function isSyncResult(value: unknown): value is CommercialRateSyncResult {
  return typeof value === "object" && value !== null
    && "outcome" in value && (value.outcome === "published" || value.outcome === "no_op")
    && "publishedCount" in value && Number.isInteger(value.publishedCount)
    && "checkedAt" in value && typeof value.checkedAt === "string"
    && "rates" in value && Array.isArray(value.rates);
}
