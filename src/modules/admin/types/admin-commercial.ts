export interface AdminCommercialRecord {
  id: string;
  primary: string;
  secondary: string;
  status: string;
}

export interface AdminCommercialSummary {
  domain: string;
  metrics: Readonly<Record<string, string | number | null>>;
  records: readonly AdminCommercialRecord[];
}

export interface AdminRetailPriceHistoryHealth {
  productsWithCurrentRetail: number;
  productsWithHistory: number;
  productsWithBaselineOnly: number;
  lastHistoryUpdate: string | null;
  failedHistoryAppendCount: number;
  currencyDistribution: Readonly<Record<string, number>>;
  verification: {
    status: "currency_verification_required" | "verified" | "rejected";
    current_currency: string;
    source_entity: string;
    historical_rows_discovered: number;
    distinct_products: number;
    earliest_effective_at: string | null;
    latest_effective_at: string | null;
  };
  latestBackfill: {
    sync_id: string;
    status: "requested" | "running" | "succeeded" | "failed";
    source_rows: number;
    mapped_products: number;
    unresolved_products: number;
    malformed_rows: number;
    reduced_change_points: number;
    inserted_change_points: number;
    continuity_matches: number;
    continuity_mismatches: number;
    earliest_effective_at: string | null;
    latest_effective_at: string | null;
    duration_ms: number | null;
    safe_error: string | null;
  } | null;
  openIncidentCount: number;
}
