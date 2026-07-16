import type {
  CustomerProposalDto,
  Estimate,
  EstimateSentChannel,
  EstimateVersion,
  EstimateVersionStatus,
  ProposalTemplate,
} from "../types";

export type RefreshedProductPrice = {
  productId: string;
  amount: number | null;
  currencyCode: string | null;
  snapshotAt: string | null;
  convertedPrice: number | null;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
};

export interface EstimateLifecycleRepository {
  listVersions(estimateId: string): Promise<EstimateVersion[]>;
  findVersion(versionId: string): Promise<EstimateVersion | null>;
  listLatestDocuments(versionIds: string[]): Promise<Map<string, { id: string; status: "queued" | "generating" | "ready" | "failed" }>>;
  createVersion(input: {
    estimateId: string;
    expectedRevision: number;
    note: string | null;
    changeReason: string | null;
    customerProposalSnapshot: CustomerProposalDto;
  }): Promise<EstimateVersion>;
  markReady(estimateId: string, expectedRevision: number): Promise<Estimate>;
  transitionVersion(input: {
    versionId: string;
    status: Exclude<EstimateVersionStatus, "prepared" | "archived">;
    channel?: EstimateSentChannel | null;
    note?: string | null;
  }): Promise<EstimateVersion>;
  restoreDraft(versionId: string, prices: RefreshedProductPrice[]): Promise<Estimate>;
  duplicate(estimateId: string): Promise<Estimate>;
  createTemplate(input: { estimateId: string; name: string; includeServiceLines: boolean }): Promise<ProposalTemplate>;
  createFromCart(input: {
    cartId: string;
    name: string;
    currencyCode: string;
    requestKey: string;
    lines: Array<{
      productId: string;
      position: number;
      sku: string;
      productName: string;
      quantity: number;
      partnerPrice: number | null;
      currencyCode: string | null;
      snapshotAt: string | null;
      convertedPrice: number | null;
      exchangeRate: number | null;
      exchangeRateDate: string | null;
    }>;
  }): Promise<Estimate>;
}

export class EstimateLifecycleRepositoryError extends Error {
  constructor(readonly code: string | null = null) {
    super("Estimate lifecycle persistence failed.");
    this.name = "EstimateLifecycleRepositoryError";
  }
}
