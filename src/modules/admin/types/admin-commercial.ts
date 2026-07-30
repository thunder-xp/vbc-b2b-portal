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

export const RETAIL_HISTORY_ABSENCE_REASONS = [
  "no_retail_register_record",
  "baseline_only_new_product",
  "current_price_without_historical_source",
  "source_record_not_currently_authoritative",
  "unknown_requires_review",
] as const;

export type RetailHistoryAbsenceReason =
  (typeof RETAIL_HISTORY_ABSENCE_REASONS)[number];

export interface AdminRetailHistoryAbsenceFilters {
  search?: string;
  categoryId?: string;
  reason?: RetailHistoryAbsenceReason;
  page?: number;
  pageSize?: number;
}

export interface AdminRetailHistoryAbsenceRecord {
  id: string;
  imageUrl: string | null;
  sku: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  brandName: string | null;
  portalStatus: "active_visible";
  currentRetailPrice: number | null;
  currentRetailCurrency: string | null;
  currentRetailEffectiveAt: string | null;
  baselineHistoryState: "present" | "absent";
  firstPortalPublishedAt: string;
  external1cRef: string;
  absenceReason: RetailHistoryAbsenceReason;
}

export interface AdminRetailHistoryAbsencePage {
  summary: {
    activePartnerVisibleProducts: number;
    productsWithVerifiedHistory: number;
    baselineOnlyProducts: number;
    productsWithoutRetailRegisterSource: number;
    unresolvedOutOfScopeHistoricalReferences: number;
  };
  categories: readonly {
    id: string | null;
    name: string;
    count: number;
  }[];
  reasonCounts: Partial<Record<RetailHistoryAbsenceReason, number>>;
  page: number;
  pageSize: number;
  total: number;
  records: readonly AdminRetailHistoryAbsenceRecord[];
}
