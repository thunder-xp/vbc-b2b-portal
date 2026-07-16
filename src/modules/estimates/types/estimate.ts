export type EstimateStatus = "draft" | "ready" | "sent" | "accepted" | "rejected" | "archived";
export type EstimateLineType = "product" | "service" | "custom";
export type EstimateUnit = "pcs" | "hour" | "meter" | "set" | "visit" | "service";
export type EstimatePricingMode = "direct" | "markup" | "margin";
export type EstimateVatMode = "included" | "separate" | "excluded" | "none";
export type EstimateChargeType = "delivery" | "installation" | "commissioning" | "transport" | "other";
export type EstimateCurrencyChangePolicy = "convert_all" | "preserve_manual";

export interface Estimate {
  id: string;
  companyId: string;
  createdBy: string;
  estimateNumber: string;
  name: string;
  customerName: string | null;
  projectName: string | null;
  currencyCode: string;
  currencyRate: number | null;
  currencyRateEffectiveDate: string | null;
  validityDays: number;
  globalDiscountPercent: number;
  vatMode: EstimateVatMode;
  vatRatePercent: number;
  subtotalAmount: number;
  lineDiscountTotal: number;
  sectionDiscountTotal: number;
  globalDiscountAmount: number;
  chargesTotal: number;
  vatAmount: number;
  totalExcludingVat: number;
  grossProfitAmount: number | null;
  overallMarginPercent: number | null;
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
  discountPercent: number;
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
  pricingMode: EstimatePricingMode;
  pricingInputValue: number | null;
  internalCostUnitPrice: number | null;
  convertedCostUnitPrice: number | null;
  exchangeRate: number | null;
  exchangeRateEffectiveDate: string | null;
  lineDiscountPercent: number;
  description: string;
  quantity: number;
  unit: EstimateUnit;
  sellingUnitPrice: number | null;
  lineTotal: number | null;
  lineSubtotal: number | null;
  lineDiscountAmount: number | null;
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
  defaultCost: number | null;
  defaultSellingPrice: number | null;
  vatApplicable: boolean;
  category: string;
}

export interface EstimateCharge {
  id: string;
  estimateId: string;
  chargeType: EstimateChargeType;
  description: string;
  amount: number;
  vatApplicable: boolean;
  customerVisible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateAggregate {
  estimate: Estimate;
  sections: EstimateSection[];
  items: EstimateItem[];
  charges: EstimateCharge[];
}
