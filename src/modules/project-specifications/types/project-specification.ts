export enum ProjectSpecificationStatus {
  Draft = "draft",
  Submitted = "submitted",
  UnderReview = "under_review",
  Approved = "approved",
  ChangesRequested = "changes_requested",
  Rejected = "rejected",
}

export interface ProjectSpecification {
  id: string;
  companyId: string;
  createdBy: string;
  projectName: string;
  customerSiteName: string;
  description: string | null;
  status: ProjectSpecificationStatus;
  submittedAt: string | null;
  parentSpecificationId: string | null;
  revisionNumber: number;
  reviewComment: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  partnerPurchaseTotalAmount: number | null;
  partnerCurrencyCodeSnapshot: string | null;
  retailTotalAmount: number | null;
  retailCurrencyCodeSnapshot: string | null;
  grossProfitUsdSnapshot: number | null;
  markupPercentageSnapshot: number | null;
  commercialSnapshotAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSpecificationItem {
  id: string;
  specificationId: string;
  productId: string;
  quantity: number;
  productNameSnapshot: string | null;
  skuSnapshot: string | null;
  slugSnapshot: string | null;
  partnerUnitPriceAmount: number | null;
  partnerCurrencyCode: string | null;
  retailUnitPriceAmount: number | null;
  retailCurrencyCode: string | null;
  availableStock: number | null;
  nearestArrivalDate: string | null;
  nearestArrivalQuantity: number | null;
  grossProfitUsd: number | null;
  markupPercentage: number | null;
  partnerLineTotalAmount: number | null;
  retailLineTotalAmount: number | null;
  snapshotAt: string | null;
  createdAt: string;
  updatedAt: string;
}
