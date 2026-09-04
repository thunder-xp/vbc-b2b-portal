export type GovernedPriceCoverageCandidate = {
  productId: string;
  sku: string;
  productName: string;
  externalProductRef: string;
  externalPriceTypeRef: string;
  priceTypeName: string;
  priority: 1 | 2;
  activeCartCount: number;
  activeCartLineCount: number;
  recentOrderCount: number;
  totalQuantity: number;
  companyIds: string[];
  companyNames: string[];
  latestExposureAt: string;
};

export type GovernedPriceCoverageSnapshot = {
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
    governedValueExposureByCurrency: Array<{ currency: string; amount: number }>;
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
  issues: Array<{
    companyId: string;
    companyName: string;
    productId: string;
    sku: string;
    productName: string;
    governedPriceType: string;
    severity: "high" | "medium";
    classification: "source_gap_after_complete_sync" | "unverified_projection_gap";
    requiredAction: string;
  }>;
};

export type GovernedPricePublicationRow = {
  externalProductRef: string;
  amount: number;
  effectiveAt: string;
  isActive: boolean;
};

export interface PriceCoverageAuditRepository {
  listCandidates(limit: number): Promise<GovernedPriceCoverageCandidate[]>;
  getSnapshot(): Promise<GovernedPriceCoverageSnapshot>;
  publishVerifiedPrices(input: {
    externalPriceTypeRef: string;
    rows: GovernedPricePublicationRow[];
    verifiedAt: string;
  }): Promise<number>;
}
