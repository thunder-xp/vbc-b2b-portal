import {
  ProjectSpecificationStatus,
  type ProjectSpecification,
  type ProjectSpecificationItem,
} from "../../types";

export type ProjectSpecificationRow = {
  id: string;
  company_id: string;
  created_by: string;
  project_name: string;
  customer_site_name: string;
  description: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSpecificationItemRow = {
  id: string;
  specification_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

export function mapProjectSpecificationRow(
  row: ProjectSpecificationRow,
): ProjectSpecification {
  return {
    id: row.id,
    companyId: row.company_id,
    createdBy: row.created_by,
    projectName: row.project_name,
    customerSiteName: row.customer_site_name,
    description: row.description,
    status: row.status as ProjectSpecificationStatus,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectSpecificationItemRow(
  row: ProjectSpecificationItemRow,
): ProjectSpecificationItem {
  return {
    id: row.id,
    specificationId: row.specification_id,
    productId: row.product_id,
    quantity: row.quantity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
