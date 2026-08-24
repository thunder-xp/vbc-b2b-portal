export type CompetitiveWindowDays = 7 | 30 | 90 | 36500;
export type CompetitiveVatMode = "included" | "excluded" | "not_applicable" | "not_specified";
export type CompetitiveSourceType = "verbal" | "message" | "quotation" | "order" | "invoice" | "other";
export type CompetitiveConfidence = "low" | "medium" | "high";

export type CompetitorOption = { id: string; name: string };

export type PartnerCompetitiveObservation = {
  id: string;
  date: string;
  competitorName: string;
  price: number;
  currency: string;
  vatMode: CompetitiveVatMode;
  quantity: number;
  quantityCohort: "single" | "small" | "large";
  sourceType: CompetitiveSourceType;
  confidence: CompetitiveConfidence;
  possibleOutlier: boolean;
  novotechPrice: number | null;
  novotechCurrency: string | null;
  comparisonBasis: "partner_price" | "retail_price" | null;
  comparisonStatus: "comparable" | "currency_mismatch" | "vat_not_comparable" | "price_unavailable";
  deltaAmount: number | null;
  deltaPercent: number | null;
  hasEvidence: boolean;
  evidenceId: string | null;
  supersedesObservationId: string | null;
  isSuperseded: boolean;
  createdAt: string;
};

export type PartnerCompetitiveSummary = {
  observationCount: number;
  latestDate: string | null;
  latestCompetitorPrice: number | null;
  latestCurrency: string | null;
  latestNovotechPrice: number | null;
  latestNovotechCurrency: string | null;
  latestDeltaAmount: number | null;
  latestDeltaPercent: number | null;
};

export type PartnerProductCompetitiveIntelligence = {
  canManage: boolean;
  windowDays: CompetitiveWindowDays;
  competitors: CompetitorOption[];
  observations: PartnerCompetitiveObservation[];
  summary: PartnerCompetitiveSummary;
};

export type CompetitiveObservationReceipt = {
  id: string;
  duplicate: boolean;
  idempotent: boolean;
  comparisonStatus: PartnerCompetitiveObservation["comparisonStatus"];
  deltaAmount: number | null;
  deltaPercent: number | null;
  confidence?: CompetitiveConfidence;
  possibleOutlier?: boolean;
};

export type MarketProductRow = {
  productId: string;
  sku: string;
  productName: string;
  competitorId: string;
  competitorName: string;
  currency: string;
  vatMode: CompetitiveVatMode;
  quantityCohort: string;
  marketMedian: number;
  novotechComparison: number | null;
  min: number;
  p25: number;
  p75: number;
  max: number;
  latest: number;
  trendPercent: number | null;
  observations: number;
  uniqueCompanies: number;
  confidence: CompetitiveConfidence;
  latestDate: string;
  recommendation: string | null;
};

export type MarketIntelligenceDashboard = {
  summary: {
    observations: number;
    companies: number;
    products: number;
    competitors: number;
    pendingCompetitors: number;
    freshestObservation: string | null;
  };
  products: MarketProductRow[];
  competitors: CompetitorOption[];
  pendingCompetitors: Array<{ id: string; name: string; observationCount: number; lastObservedAt: string }>;
  recommendations: Array<{
    id: string;
    productId: string;
    sku: string;
    productName: string;
    type: string;
    status: string;
    evidence: Record<string, unknown>;
    generatedAt: string;
  }>;
};

export type CompetitorIntelligenceProfile = {
  id: string;
  name: string;
  status: string;
  aliases: string[];
  categories: string[];
  lowerThanNovotechProducts: number;
  higherThanNovotechProducts: number;
  medianPriceChangeIntervalDays: number | null;
  products: Array<{
    productId: string;
    sku: string;
    name: string;
    median: number;
    currency: string;
    trendPercent: number | null;
    observations: number;
    uniqueCompanies: number;
    confidence: CompetitiveConfidence;
    relativePosition: "competitor_lower" | "novotech_lower" | "parity" | "unknown";
  }>;
};

export type ProductMarketIntelligenceProfile = {
  id: string;
  sku: string;
  name: string;
  cohorts: Array<Record<string, unknown>>;
  signals: Array<Record<string, unknown>>;
  timeline: Array<Record<string, unknown>>;
};

export type CompetitiveEvidenceDescriptor = {
  bucket: string;
  key: string;
  fileName: string;
  mimeType: string;
  size: number;
};
