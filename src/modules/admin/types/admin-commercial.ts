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
}
