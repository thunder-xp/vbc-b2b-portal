export type CompetitivePressureProduct = {
  productId: string;
  sku: string;
  productName: string;
  sourceName: string | null;
  novotechPrice: number | null;
  novotechCurrency: string | null;
  competitorMedianPrice: number | null;
  competitorBestPrice: number | null;
  competitorCurrency: string | null;
  gapAmount: number | null;
  gapPct: number | null;
  contributingPartnerCount: number;
  freshnessDays: number | null;
  confidence: "low" | "medium" | "high";
  partnerExposureCount: number;
  priority: number;
};

export type PartnerCompetitiveExposure = {
  companyId: string;
  partnerName: string;
  productsUnderPressure: number;
  averageWeightedGap: number | null;
  recentPurchasesAffected: number;
  estimatedExposedRevenue: number | null;
  currency: string | null;
  freshnessDays: number | null;
  attentionLevel: "low" | "medium" | "high";
};

export type CompetitiveIntelligenceDashboard = {
  products: CompetitivePressureProduct[];
  partners: PartnerCompetitiveExposure[];
  counts: {
    productsUnderPressure: number;
    partnersExposed: number;
    lowConfidenceProducts: number;
  };
};

export type CompanyCompetitiveProduct = {
  sku: string;
  productName: string;
  sourceName: string | null;
  novotechPrice: number | null;
  competitorPrice: number | null;
  currency: string | null;
  gapPct: number | null;
  purchases90d: number;
  lastPurchaseAt: string | null;
  confidence: "low" | "medium" | "high";
};

export type CompanyCompetitiveIntelligenceData = {
  items: CompanyCompetitiveProduct[];
};
