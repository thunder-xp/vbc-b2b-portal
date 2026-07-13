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

export interface ProjectSpecificationRepository {
  listByCompanyId(companyId: string): Promise<ProjectSpecification[]>;
  findById(specificationId: string): Promise<ProjectSpecification | null>;
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
  submit(specificationId: string): Promise<ProjectSpecification>;
}

export class ProjectSpecificationRepositoryError extends Error {
  constructor() {
    super("Project specification persistence failed.");
    this.name = "ProjectSpecificationRepositoryError";
  }
}
