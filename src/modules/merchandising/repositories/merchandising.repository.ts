import type {
  AdminMerchandisingPage,
  ManageMerchandisingInput,
  MerchandisingLabelCode,
  PublishedMerchandisingAssignment,
} from "../types";

export interface MerchandisingRepository {
  listAdminProducts(input: {
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<AdminMerchandisingPage>;
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
    "operation" | "productIds" | "labelCode" | "priority" | "reason"
  >> & Pick<ManageMerchandisingInput, "startsAt" | "endsAt">): Promise<number>;
}

export class MerchandisingRepositoryError extends Error {
  constructor(readonly safeCode = "MERCHANDISING_REPOSITORY_ERROR") {
    super(safeCode);
    this.name = "MerchandisingRepositoryError";
  }
}
