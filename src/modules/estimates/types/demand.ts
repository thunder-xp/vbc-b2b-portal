export type ExternalDemandStatus = "new" | "reviewing" | "solution_proposed" | "closed" | "cancelled";
export type ExternalDemandResponseType = "catalog_product" | "governed_alternative" | "sourcing_review" | "cannot_supply";

export type ExternalDemandState = {
  id: string;
  status: ExternalDemandStatus | null;
  version: number;
};

export type ExternalDemandSummary = {
  externalItemId: string;
  manufacturer: string;
  model: string;
  name: string;
  category: string | null;
  unit: string;
  estimateCount: number;
  partnerCount: number;
  customerCount: number;
  requestedQuantity: number;
  firstObserved: string;
  lastObserved: string;
  explicitRequestCount: number;
};

export type ExternalDemandRequestDetail = ExternalDemandState & {
  companyName: string;
  estimateId: string;
  estimateNumber: string;
  estimateLifecycle: string;
  customerName: string | null;
  industryCode: string | null;
  locality: string | null;
  projectName: string | null;
  quantity: number;
  unit: string;
  requestedAt: string;
  responses: Array<{ id: string; type: ExternalDemandResponseType; catalogProductId: string | null; createdAt: string }>;
};

export type ExternalDemandDetail = {
  item: Pick<ExternalDemandSummary, "externalItemId" | "manufacturer" | "model" | "name" | "category" | "unit">;
  requests: ExternalDemandRequestDetail[];
  possibleDuplicates: Array<{ id: string; manufacturer: string; model: string; name: string }>;
};

export type UnmetDemandWindow = 30 | 90 | 180;
export type MoneyByCurrency = Record<string, number>;

export type UnmetDemandAnalyticsItem = {
  productId: string;
  sku: string;
  productName: string;
  brandName: string | null;
  categoryName: string | null;
  partnerCount: number;
  requests: number;
  requestedQuantity: number;
  shortageQuantity: number;
  potentialValueByCurrency: MoneyByCurrency;
  lastDemandAt: string;
  trend: "up" | "down" | "stable";
};

export type UnmetDemandAnalytics = {
  windowDays: UnmetDemandWindow;
  summary: {
    requests: number;
    uniqueSku: number;
    uniquePartners: number;
    shortageUnits: number;
    potentialValueByCurrency: MoneyByCurrency;
  };
  items: UnmetDemandAnalyticsItem[];
  total: number;
};

export type UnmetDemandEvidenceDetail = {
  product: {
    productId: string;
    sku: string;
    productName: string;
    brandName: string | null;
    categoryName: string | null;
  };
  events: Array<{
    id: string;
    companyName: string;
    partnerUserId: string;
    estimateId: string;
    estimateNumber: string;
    finalCustomerId: string | null;
    requestedQuantity: number;
    availableQuantity: number;
    shortageQuantity: number;
    priceAtDemand: number | null;
    currencyCode: string | null;
    reason: "PARTIAL_STOCK" | "OUT_OF_STOCK" | "NOT_STOCKED" | "DISCONTINUED";
    occurredAt: string;
    correlationId: string;
  }>;
};
