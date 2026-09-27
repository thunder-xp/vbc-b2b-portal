import { createAdminClient } from "@/src/lib/supabase/admin";
import type { ExchangeRateSyncService } from "../sync";

export const COMMERCIAL_RATE_CHECKOUT_FRESH_MS = 10 * 60 * 1000;

export type CommercialRateCheckoutEvidence = {
  retailRateId: string;
  checkedAt: string;
  refreshed: boolean;
};

export type CommercialRateEvidenceReader = (
  stage: CommercialRateFreshnessError["stage"],
) => Promise<Omit<CommercialRateCheckoutEvidence, "refreshed">>;

export class CommercialRateFreshnessError extends Error {
  readonly correlationId = crypto.randomUUID();
  constructor(readonly stage: "state_read" | "targeted_refresh" | "evidence_read", options?: ErrorOptions) {
    super("Authoritative commercial rate could not be proven fresh.", options);
    this.name = "CommercialRateFreshnessError";
  }
}

export class CommercialRateCheckoutGuard {
  constructor(
    private readonly syncService: ExchangeRateSyncService,
    private readonly now: () => Date = () => new Date(),
    private readonly evidenceReader?: CommercialRateEvidenceReader,
  ) {}

  async ensureFresh(): Promise<CommercialRateCheckoutEvidence> {
    const initial = await this.readEvidence("state_read");
    if (this.isFresh(initial)) return { ...initial, refreshed: false };
    const correlationId = crypto.randomUUID();
    try {
      await this.syncService.sync(correlationId);
    } catch (error) {
      throw new CommercialRateFreshnessError("targeted_refresh", { cause: error });
    }
    const refreshed = await this.readEvidence("evidence_read");
    if (!this.isFresh(refreshed)) throw new CommercialRateFreshnessError("evidence_read");
    return { ...refreshed, refreshed: true };
  }

  private isFresh(evidence: Omit<CommercialRateCheckoutEvidence, "refreshed">): boolean {
    const checkedAt = Date.parse(evidence.checkedAt);
    return Number.isFinite(checkedAt) && this.now().getTime() - checkedAt <= COMMERCIAL_RATE_CHECKOUT_FRESH_MS;
  }

  private async readEvidence(stage: CommercialRateFreshnessError["stage"]): Promise<Omit<CommercialRateCheckoutEvidence, "refreshed">> {
    if (this.evidenceReader) return this.evidenceReader(stage);
    const client = createAdminClient();
    const [{ data: state, error: stateError }, { data: rate, error: rateError }] = await Promise.all([
      client.from("commercial_rate_sync_state")
        .select("last_source_checked_at,last_result")
        .eq("id", "authoritative_1c")
        .maybeSingle(),
      client.from("commercial_exchange_rates")
        .select("id,source_type")
        .eq("purpose", "retail_price_usd_to_mdl")
        .eq("is_active", true)
        .eq("is_published", true)
        .maybeSingle(),
    ]);
    if (stateError || rateError || !state?.last_source_checked_at || !rate?.id
      || state.last_result === "FAILED" || rate.source_type !== "one_c_automatic") {
      throw new CommercialRateFreshnessError(stage);
    }
    return { retailRateId: rate.id, checkedAt: state.last_source_checked_at };
  }
}
