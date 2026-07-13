import type {
  ProjectSpecification,
  ProjectSpecificationItem,
} from "../types";

export type CreateProjectSpecificationInput = {
  companyId: string;
  createdBy: string;
  projectName: string;
  customerSiteName: string;
  description: string | null;
};

export type UpdateProjectSpecificationInput = {
  specificationId: string;
  projectName: string;
  customerSiteName: string;
  description: string | null;
};

export type ProjectSpecificationItemSnapshotInput = {
  itemId: string;
  productName: string;
  sku: string;
  slug: string;
  partnerUnitPriceAmount: number | null;
  partnerCurrencyCode: string | null;
  retailUnitPriceAmount: number | null;
  retailCurrencyCode: string | null;
  availableStock: number | null;
  nearestArrivalDate: string | null;
  nearestArrivalQuantity: number | null;
  grossProfitUsd: number | null;
  markupPercentage: number | null;
};

export type InternalSpecificationReviewRecord = {
  specification: ProjectSpecification;
  companyName: string;
};

export type ReviewProjectSpecificationResult = {
  specificationId: string;
  status: ProjectSpecification["status"];
  revisionId: string | null;
};

export interface ProjectSpecificationRepository {
  listByCompanyId(companyId: string): Promise<ProjectSpecification[]>;
  listForInternalReview(): Promise<InternalSpecificationReviewRecord[]>;
  findById(specificationId: string): Promise<ProjectSpecification | null>;
  findRevisionByParentId(specificationId: string): Promise<ProjectSpecification | null>;
  listItems(specificationId: string): Promise<ProjectSpecificationItem[]>;
  create(input: CreateProjectSpecificationInput): Promise<ProjectSpecification>;
  updateDraft(input: UpdateProjectSpecificationInput): Promise<ProjectSpecification>;
  addItem(input: {
    specificationId: string;
    productId: string;
    quantity: number;
  }): Promise<ProjectSpecificationItem>;
  updateItemQuantity(input: {
    itemId: string;
    quantity: number;
  }): Promise<ProjectSpecificationItem>;
  removeItem(itemId: string): Promise<void>;
  submit(specificationId: string, snapshots: ProjectSpecificationItemSnapshotInput[]): Promise<ProjectSpecification>;
  canReviewInternally(): Promise<boolean>;
  review(input: {
    specificationId: string;
    status: ProjectSpecification["status"];
    comment: string | null;
  }): Promise<ReviewProjectSpecificationResult>;
}

export class ProjectSpecificationRepositoryError extends Error {
  constructor() {
    super("Project specification persistence failed.");
    this.name = "ProjectSpecificationRepositoryError";
  }
}
