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
  parent_specification_id: string | null;
  revision_number: number;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  partner_purchase_total_amount: number | null;
  partner_currency_code_snapshot: string | null;
  retail_total_amount: number | null;
  retail_currency_code_snapshot: string | null;
  gross_profit_usd_snapshot: number | null;
  markup_percentage_snapshot: number | null;
  commercial_snapshot_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSpecificationItemRow = {
  id: string;
  specification_id: string;
  product_id: string;
  quantity: number;
  product_name_snapshot: string | null;
  sku_snapshot: string | null;
  slug_snapshot: string | null;
  partner_unit_price_amount: number | null;
  partner_currency_code: string | null;
  retail_unit_price_amount: number | null;
  retail_currency_code: string | null;
  available_stock: number | null;
  nearest_arrival_date: string | null;
  nearest_arrival_quantity: number | null;
  gross_profit_usd: number | null;
  markup_percentage: number | null;
  partner_line_total_amount: number | null;
  retail_line_total_amount: number | null;
  snapshot_at: string | null;
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
    parentSpecificationId: row.parent_specification_id,
    revisionNumber: row.revision_number,
    reviewComment: row.review_comment,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    partnerPurchaseTotalAmount: row.partner_purchase_total_amount,
    partnerCurrencyCodeSnapshot: row.partner_currency_code_snapshot,
    retailTotalAmount: row.retail_total_amount,
    retailCurrencyCodeSnapshot: row.retail_currency_code_snapshot,
    grossProfitUsdSnapshot: row.gross_profit_usd_snapshot,
    markupPercentageSnapshot: row.markup_percentage_snapshot,
    commercialSnapshotAt: row.commercial_snapshot_at,
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
    productNameSnapshot: row.product_name_snapshot,
    skuSnapshot: row.sku_snapshot,
    slugSnapshot: row.slug_snapshot,
    partnerUnitPriceAmount: row.partner_unit_price_amount,
    partnerCurrencyCode: row.partner_currency_code,
    retailUnitPriceAmount: row.retail_unit_price_amount,
    retailCurrencyCode: row.retail_currency_code,
    availableStock: row.available_stock,
    nearestArrivalDate: row.nearest_arrival_date,
    nearestArrivalQuantity: row.nearest_arrival_quantity,
    grossProfitUsd: row.gross_profit_usd,
    markupPercentage: row.markup_percentage,
    partnerLineTotalAmount: row.partner_line_total_amount,
    retailLineTotalAmount: row.retail_line_total_amount,
    snapshotAt: row.snapshot_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
