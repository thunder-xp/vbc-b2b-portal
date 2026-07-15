export type EstimateStatus = "draft" | "ready" | "sent" | "accepted" | "rejected" | "archived";
export type EstimateLineType = "product" | "service" | "custom";
export type EstimateUnit = "pcs" | "hour" | "meter" | "set" | "visit" | "service";

export interface Estimate {
  id: string;
  companyId: string;
  createdBy: string;
  estimateNumber: string;
  name: string;
  customerName: string | null;
  projectName: string | null;
  currencyCode: string;
  validityDays: number;
  status: EstimateStatus;
  totalAmount: number;
  hasIncompletePricing: boolean;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateSection {
  id: string;
  estimateId: string;
  name: string;
  sortOrder: number;
  showSubtotal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateItem {
  id: string;
  estimateId: string;
  sectionId: string;
  lineType: EstimateLineType;
  productId: string | null;
  serviceId: string | null;
  position: number;
  skuSnapshot: string | null;
  productNameSnapshot: string | null;
  sourceUnitPrice: number | null;
  sourceCurrencyCode: string | null;
  sourceSnapshotAt: string | null;
  description: string;
  quantity: number;
  unit: EstimateUnit;
  sellingUnitPrice: number | null;
  lineTotal: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerService {
  id: string;
  companyId: string | null;
  name: string;
  defaultUnit: EstimateUnit;
  description: string | null;
  sortOrder: number;
}

export interface EstimateAggregate {
  estimate: Estimate;
  sections: EstimateSection[];
  items: EstimateItem[];
}
