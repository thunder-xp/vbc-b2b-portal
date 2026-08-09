import type {
  Estimate,
  EstimateAggregate,
  EstimateLineType,
  EstimateStatus,
  EstimateLifecycleStatus,
  EstimateUnit,
  EstimateVatMode,
  EstimatePricingMode,
  EstimateChargeType,
  PartnerService,
  FinalCustomer,
  FinalCustomerDetail,
  FinalCustomerIndustryCode,
  FinalCustomerListRecord,
  FinalCustomerType,
} from "../types";

export type EstimateListInput = {
  companyId: string;
  search?: string;
  status?: EstimateStatus;
  lifecycleStatus?: EstimateLifecycleStatus;
  versionStatus?: import("../types").EstimateVersionStatus | "has_sent";
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
};

export type EstimateListRecord = Estimate & {
  itemCount: number;
  createdByName: string;
  versionCount: number;
  latestVersionStatus: import("../types").EstimateVersionStatus | null;
  latestVersionId: string | null;
  latestPdfDocumentId: string | null;
  hasAcceptedVersion: boolean;
};

export type CreateEstimateInput = {
  companyId: string;
  name: string;
  finalCustomerId: string | null;
  customerName: string | null;
  projectName: string | null;
  currencyCode: string;
  validityDays: number;
  requestKey: string;
};

export type FinalCustomerListInput = {
  companyId: string;
  search?: string;
  industryCode?: FinalCustomerIndustryCode;
  limit: number;
  offset: number;
};

export type ExternalNomenclatureRecord = {
  id: string;
  manufacturer: string;
  model: string;
  name: string;
  category: string | null;
  unit: EstimateUnit;
  specification: string | null;
  exactIdentityMatch: boolean;
};

export type AddExternalEstimateLineInput = {
  estimateId: string;
  expectedRevision: number;
  targetSectionId: string;
  requestKey: string;
  requestFingerprint: string;
  existingExternalItemId: string | null;
  manufacturer: string;
  model: string;
  name: string;
  category: string | null;
  unit: EstimateUnit;
  specification: string | null;
  quantity: number;
  sellingUnitPrice: number;
  forceCreateNew: boolean;
};

export type AddEstimateLineInput = {
  lineType: EstimateLineType;
  productId: string | null;
  serviceId: string | null;
  skuSnapshot: string | null;
  productNameSnapshot: string | null;
  sourceUnitPrice: number | null;
  sourceCurrencyCode: string | null;
  sourceSnapshotAt: string | null;
  internalCostUnitPrice?: number | null;
  convertedCostUnitPrice?: number | null;
  exchangeRate?: number | null;
  exchangeRateEffectiveDate?: string | null;
  description: string;
  quantity: number;
  unit: EstimateUnit;
  sellingUnitPrice: number | null;
};

export type AddEstimateLineBatchInput = {
  estimateId: string;
  expectedRevision: number;
  targetSectionId: string;
  requestKey: string;
  requestFingerprint: string;
  lines: AddEstimateLineInput[];
};

export type SaveEstimateCommercialInput = {
  estimateId: string;
  expectedRevision: number;
  settings: {
    name: string;
    finalCustomerId: string | null;
    customerName: string | null;
    projectName: string | null;
    validityDays: number;
    currencyCode: string;
    currencyRate: number | null;
    currencyRateEffectiveDate: string | null;
    vatMode: EstimateVatMode;
    vatRatePercent: number;
    globalDiscountPercent: number;
  };
  sections: Array<{ id: string; name: string; sortOrder: number; showSubtotal: boolean; discountPercent: number }>;
  lines: Array<{
    id: string;
    sectionId: string;
    position: number;
    description: string;
    quantity: number;
    unit: EstimateUnit;
    pricingMode: EstimatePricingMode;
    pricingInputValue: number | null;
    internalCostUnitPrice: number | null;
    convertedCostUnitPrice: number | null;
    exchangeRate: number | null;
    exchangeRateEffectiveDate: string | null;
    lineDiscountPercent: number;
  }>;
  charges: Array<{
    id: string;
    chargeType: EstimateChargeType;
    description: string;
    amount: number;
    vatApplicable: boolean;
    customerVisible: boolean;
    sortOrder: number;
  }>;
};

export interface EstimateRepository {
  list(input: EstimateListInput): Promise<{ records: EstimateListRecord[]; totalCount: number }>;
  findById(estimateId: string): Promise<Estimate | null>;
  findAggregateById(estimateId: string): Promise<EstimateAggregate | null>;
  create(input: CreateEstimateInput): Promise<Estimate>;
  searchFinalCustomers?(companyId: string, query: string, limit: number): Promise<FinalCustomer[]>;
  listFinalCustomers?(input: FinalCustomerListInput): Promise<{ records: FinalCustomerListRecord[]; totalCount: number }>;
  getFinalCustomerDetail?(companyId: string, customerId: string, estimateLimit: number): Promise<FinalCustomerDetail | null>;
  createFinalCustomer?(input: {
    companyId: string;
    displayName: string;
    customerType: FinalCustomerType;
    fiscalCode: string | null;
    locality: string | null;
    industryCode: FinalCustomerIndustryCode | null;
  }): Promise<FinalCustomer>;
  updateFinalCustomer?(input: {
    companyId: string;
    customerId: string;
    expectedRevision: number;
    displayName: string;
    customerType: FinalCustomerType;
    fiscalCode: string | null;
    locality: string | null;
    industryCode: FinalCustomerIndustryCode | null;
  }): Promise<FinalCustomer>;
  archiveFinalCustomer?(customerId: string, expectedRevision: number): Promise<void>;
  searchExternalNomenclature?(query: string, limit: number): Promise<ExternalNomenclatureRecord[]>;
  addExternalLine?(input: AddExternalEstimateLineInput): Promise<void>;
  createFromPurchasingList(input: {
    listId: string;
    requestKey: string;
    requestFingerprint: string;
    name: string;
    currencyCode: string;
    items: Array<{
      itemId: string;
      productId: string;
      quantity: number;
      sku: string;
      productName: string;
      sourceUnitPrice: number;
      sourceCurrencyCode: string;
      sourceSnapshotAt: string | null;
      sellingUnitPrice: number;
      convertedCostUnitPrice: number;
      exchangeRate: number;
      exchangeRateEffectiveDate: string | null;
    }>;
    summary: Record<string, number>;
  }): Promise<{ estimateId: string; repeated: boolean }>;
  updateDraft(input: {
    estimateId: string;
    expectedRevision: number;
    name: string;
    finalCustomerId: string | null;
    customerName: string | null;
    projectName: string | null;
    validityDays: number;
  }): Promise<Estimate>;
  saveCommercialDraft(input: SaveEstimateCommercialInput): Promise<Estimate>;
  addLines(input: AddEstimateLineBatchInput): Promise<void>;
  updateLine(input: {
    estimateId: string;
    itemId: string;
    expectedRevision: number;
    description: string;
    quantity: number;
    unit: EstimateUnit;
    sellingUnitPrice: number;
  }): Promise<void>;
  removeLine(estimateId: string, itemId: string, expectedRevision: number): Promise<void>;
  removeLines(estimateId: string, itemIds: string[], expectedRevision: number): Promise<void>;
  archive(estimateId: string, expectedRevision: number): Promise<void>;
  listServices(companyId: string): Promise<PartnerService[]>;
}

export class EstimateRepositoryError extends Error {
  constructor(
    public readonly code: "conflict" | "not_found" | "duplicate" | "invalid" | "persistence" = "persistence",
    public readonly databaseCode: string | null = null,
  ) {
    super("Estimate persistence failed.");
    this.name = "EstimateRepositoryError";
  }
}
