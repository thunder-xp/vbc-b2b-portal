export enum ProjectSpecificationStatus {
  Draft = "draft",
  Submitted = "submitted",
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
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSpecificationItem {
  id: string;
  specificationId: string;
  productId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}
