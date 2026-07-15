import type {
  Estimate,
  EstimateAggregate,
  EstimateLineType,
  EstimateStatus,
  EstimateUnit,
  PartnerService,
} from "../types";

export type EstimateListInput = {
  companyId: string;
  search?: string;
  status?: EstimateStatus;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
};

export type EstimateListRecord = Estimate & {
  itemCount: number;
  createdByName: string;
};

export type CreateEstimateInput = {
  companyId: string;
  name: string;
  customerName: string | null;
  projectName: string | null;
  currencyCode: string;
  validityDays: number;
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
  description: string;
  quantity: number;
  unit: EstimateUnit;
  sellingUnitPrice: number | null;
};

export interface EstimateRepository {
  list(input: EstimateListInput): Promise<{ records: EstimateListRecord[]; totalCount: number }>;
  findById(estimateId: string): Promise<Estimate | null>;
  findAggregateById(estimateId: string): Promise<EstimateAggregate | null>;
  create(input: CreateEstimateInput): Promise<Estimate>;
  updateDraft(input: {
    estimateId: string;
    expectedRevision: number;
    name: string;
    customerName: string | null;
    projectName: string | null;
    validityDays: number;
  }): Promise<Estimate>;
  addLines(estimateId: string, expectedRevision: number, lines: AddEstimateLineInput[]): Promise<void>;
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
  archive(estimateId: string, expectedRevision: number): Promise<void>;
  listServices(companyId: string): Promise<PartnerService[]>;
}

export class EstimateRepositoryError extends Error {
  constructor(public readonly code: "conflict" | "not_found" | "persistence" = "persistence") {
    super("Estimate persistence failed.");
    this.name = "EstimateRepositoryError";
  }
}
