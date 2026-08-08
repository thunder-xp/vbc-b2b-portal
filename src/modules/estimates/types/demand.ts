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
