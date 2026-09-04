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

export type CommercialIntegrityReason =
  | "company_price_profile_missing"
  | "missing_partner_price"
  | "missing_retail"
  | "missing_stock"
  | "stale_partner_price"
  | "stale_stock"
  | "unpublished_product";

export interface AdminCommercialIntegrity {
  generatedAt: string;
  cartSummary: {
    activeLines: number;
    fullyResolved: number;
    missingPartnerPrice: number;
    missingRetail: number;
    missingStock: number;
    staleStock: number;
    stalePrice: number;
    missingCompanyPriceProfile: number;
    oldestUnresolvedAt: string | null;
  };
  cartLines: readonly {
    id: string;
    cartId: string;
    companyName: string;
    sku: string;
    productName: string;
    reasons: readonly CommercialIntegrityReason[];
    hasConfirmedArrival: boolean;
    updatedAt: string;
  }[];
  orderSummary: {
    reviewRequired: number;
    sourceDeleted: number;
    zeroLocalLines: number;
    partiallyResolved: number;
  };
  orders: readonly {
    id: string;
    orderNumber: string;
    companyName: string;
    sourceLineCount: number;
    localLineCount: number;
    unmappedLineCount: number;
    reason: "source_document_deleted" | "source_zero_lines" | "zero_local_lines" | "partially_resolved" | "unmapped_products";
    lastSyncedAt: string;
  }[];
  priceSync: AdminCommercialIntegritySyncState | null;
  stockSync: AdminCommercialIntegritySyncState | null;
}

export interface AdminCommercialIntegritySyncState {
  status: string;
  stage: string | null;
  lastSuccessfulAt: string | null;
  failedStage: string | null;
  databaseErrorCode: string | null;
  safeError: string | null;
  updatedAt: string;
}

export interface AdminGovernedPriceCoverage {
  generatedAt: string;
  summary: {
    activeOrderCapableCompanies: number;
    activeCarts: number;
    nonEmptyActiveCarts: number;
    totalCartLines: number;
    linesWithProductMapping: number;
    linesWithGovernedPrice: number;
    missingGovernedPriceLines: number;
    uniqueAffectedCompanies: number;
    uniqueAffectedProducts: number;
    activeCartsBlocked: number;
    governedValueExposureByCurrency: readonly { currency: string; amount: number }[];
  };
  catalogCoverage: {
    publishedActiveProducts: number;
    currentlyUsedPartnerPriceTypes: number;
    potentialProductPriceTypePairs: number;
    observedEligiblePairs: number;
    meaningfulBuyingContextPairs: number;
    meaningfulMissingPairs: number;
    theoreticalGapsTreatedAsIssues: false;
  };
  issues: readonly {
    companyId: string;
    companyName: string;
    productId: string;
    sku: string;
    productName: string;
    governedPriceType: string;
    severity: "high" | "medium";
    classification: "source_gap_after_complete_sync" | "unverified_projection_gap";
    requiredAction: string;
  }[];
}

export interface AdminStockReconciliation {
  latest: {
    syncId: string;
    snapshotTime: string;
    warehouseScopeVersion: string;
    status: "succeeded";
    totalProducts: number;
    exactMatches: number;
    sourceZeroLocalPositive: number;
    sourcePositiveLocalZero: number;
    quantityMismatches: number;
    missingWarehouseMappings: number;
    missingProductMappings: number;
    duplicateSourceRows: number;
    stalePublishedRows: number;
    characteristicConflicts: number;
    durationMs: number;
    completedAt: string;
  } | null;
  changes: readonly {
    productId: string;
    sku: string;
    name: string;
    previousAvailable: number | null;
    sourceAvailable: number;
    publishedAvailable: number | null;
    classification: "source_zero_local_positive" | "source_positive_local_zero" | "quantity_mismatch";
    postPublicationMatch: boolean;
  }[];
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
