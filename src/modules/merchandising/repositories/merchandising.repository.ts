import type {
  AdminMerchandisingPage,
  AdminMerchandisingPreview,
  ManageMerchandisingInput,
  ManageMerchandisingResult,
  MerchandisingLabelCode,
  PublishedMerchandisingAssignment,
} from "../types";

export interface MerchandisingRepository {
  listAdminProducts(input: {
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<AdminMerchandisingPage>;
  getAdminPreview(limitPerLabel: number): Promise<AdminMerchandisingPreview>;
  listPublished(input: {
    companyId: string;
    labelCode?: MerchandisingLabelCode;
    limitPerLabel: number;
  }): Promise<PublishedMerchandisingAssignment[]>;
  listPublishedForProducts(input: {
    companyId: string;
    productIds: string[];
  }): Promise<PublishedMerchandisingAssignment[]>;
  manage(input: Required<Pick<ManageMerchandisingInput,
    "requestId" | "operation" | "productIds" | "labelCode" | "priority" | "reason"
  >> & Pick<ManageMerchandisingInput, "startsAt" | "endsAt">): Promise<ManageMerchandisingResult>;
}

export class MerchandisingRepositoryError extends Error {
  constructor(
    readonly safeCode = "MERCHANDISING_UNKNOWN_FAILURE",
    readonly databaseCode: string | null = null,
  ) {
    super(safeCode);
    this.name = "MerchandisingRepositoryError";
  }
}
