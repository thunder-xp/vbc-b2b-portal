export type EstimateStatus = "draft" | "ready" | "sent" | "accepted" | "rejected" | "archived";
export type EstimateLifecycleStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted_to_order";
export type EstimateRejectionReason = "price" | "no_budget" | "other_supplier" | "project_changed" | "postponed" | "other";
export type EstimateLineType = "product" | "service" | "custom" | "external";
export type EstimateUnit = "pcs" | "hour" | "meter" | "set" | "visit" | "service";
export type EstimatePricingMode = "direct" | "markup" | "margin";
export type EstimateVatMode = "included" | "separate" | "excluded" | "none";
export type EstimateChargeType = "delivery" | "installation" | "commissioning" | "transport" | "other";
export type EstimateCurrencyChangePolicy = "convert_all" | "preserve_manual";
export type EstimateSectionSystemKey = "equipment" | "installation_materials" | "installation_works" | "commissioning_works";
import type { FinalCustomerIndustryCode } from "./final-customer";
import type { ExternalDemandState } from "./demand";

export type FinalCustomerType = "company" | "individual";

export interface FinalCustomer {
  id: string;
  companyId: string;
  displayName: string;
  customerType: FinalCustomerType;
  fiscalCode: string | null;
  locality: string | null;
  industry: string | null;
  industryCode: FinalCustomerIndustryCode | null;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinalCustomerListRecord extends FinalCustomer {
  estimateCount: number;
  lastEstimateAt: string | null;
  lastEstimateId: string | null;
  lastEstimateNumber: string | null;
  lastProjectName: string | null;
  totalCount: number;
}

export interface FinalCustomerDetail extends FinalCustomer {
  estimates: Array<{
    id: string;
    estimateNumber: string;
    name: string;
    projectName: string | null;
    status: EstimateLifecycleStatus;
    updatedAt: string;
  }>;
  lastActivityAt: string | null;
}

export interface Estimate {
  id: string;
  companyId: string;
  createdBy: string;
  estimateNumber: string;
  name: string;
  finalCustomerId?: string | null;
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
  lifecycleStatus?: EstimateLifecycleStatus;
  lifecycleSentAt?: string | null;
  lifecycleExpiresAt?: string | null;
  lifecycleAcceptedAt?: string | null;
  lifecycleRejectedAt?: string | null;
  lifecycleRejectionReason?: EstimateRejectionReason | null;
  lifecycleConvertedAt?: string | null;
  lifecycleOrderId?: string | null;
  totalAmount: number;
  hasIncompletePricing: boolean;
  proposalTemplateId?: string | null;
  proposalSettings?: Partial<import("./proposal").ProposalSettings>;
  sourceEstimateId?: string | null;
  sourceVersionId?: string | null;
  acceptedVersionId?: string | null;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateSection {
  id: string;
  estimateId: string;
  name: string;
  systemKey?: EstimateSectionSystemKey | null;
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
  externalNomenclatureId?: string | null;
  externalDemand?: ExternalDemandState | null;
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
