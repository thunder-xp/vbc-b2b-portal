import type {
  CustomerProposalDto,
  Estimate,
  EstimateSentChannel,
  EstimateRejectionReason,
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

export type EstimateVersionCreationResult =
  | { status: "created"; version: EstimateVersion; repeated: boolean }
  | { status: "conflict"; currentRevision: number; code: "ESTIMATE_VERSION_CONFLICT" };

export type EstimateCartConversionEvidence = {
  versionId: string | null;
  createdBy: string;
  direction: "cart_to_estimate" | "estimate_to_cart";
  cart: null | {
    id: string;
    companyId: string;
    createdBy: string;
    status: "active" | "submitting" | "converted" | "abandoned";
    items: Array<{ productId: string; quantity: number }>;
  };
};

export interface EstimateLifecycleRepository {
  listVersions(estimateId: string): Promise<EstimateVersion[]>;
  findVersion(versionId: string): Promise<EstimateVersion | null>;
  listLatestDocuments(versionIds: string[]): Promise<Map<string, { id: string; status: "queued" | "generating" | "ready" | "failed" }>>;
  listVersionCartConversions(estimateId: string, versionId: string): Promise<EstimateCartConversionEvidence[]>;
  createVersion(input: {
    estimateId: string;
    expectedRevision: number;
    requestKey: string;
    requestFingerprint: string;
    note: string | null;
    changeReason: string | null;
    customerProposalSnapshot: CustomerProposalDto;
  }): Promise<EstimateVersionCreationResult>;
  markReady(estimateId: string, expectedRevision: number): Promise<Estimate>;
  transitionVersion(input: {
    versionId: string;
    status: Exclude<EstimateVersionStatus, "prepared" | "archived">;
    channel?: EstimateSentChannel | null;
    note?: string | null;
    rejectionReason?: EstimateRejectionReason | null;
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

export class EstimateVersionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super("Estimate changed before version creation.");
    this.name = "EstimateVersionConflictError";
  }
}
