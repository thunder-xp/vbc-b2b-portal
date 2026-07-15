import type {
  Estimate,
  EstimateAggregate,
  EstimateItem,
  EstimateSection,
  PartnerService,
} from "../../types";

export type EstimateRow = {
  id: string;
  company_id: string;
  created_by: string;
  estimate_number: string;
  name: string;
  customer_name: string | null;
  project_name: string | null;
  currency_code: string;
  validity_days: number;
  status: Estimate["status"];
  total_amount: number | string;
  has_incomplete_pricing: boolean;
  revision: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EstimateSectionRow = {
  id: string;
  estimate_id: string;
  name: string;
  sort_order: number;
  show_subtotal: boolean;
  created_at: string;
  updated_at: string;
};

export type EstimateItemRow = {
  id: string;
  estimate_id: string;
  section_id: string;
  line_type: EstimateItem["lineType"];
  product_id: string | null;
  service_id: string | null;
  position: number;
  sku_snapshot: string | null;
  product_name_snapshot: string | null;
  source_unit_price: number | string | null;
  source_currency_code: string | null;
  source_snapshot_at: string | null;
  description: string;
  quantity: number | string;
  unit: EstimateItem["unit"];
  selling_unit_price: number | string | null;
  line_total: number | string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerServiceRow = {
  id: string;
  company_id: string | null;
  name: string;
  default_unit: PartnerService["defaultUnit"];
  description: string | null;
  sort_order: number;
};

export function mapEstimateRow(row: EstimateRow): Estimate {
  return {
    id: row.id,
    companyId: row.company_id,
    createdBy: row.created_by,
    estimateNumber: row.estimate_number,
    name: row.name,
    customerName: row.customer_name,
    projectName: row.project_name,
    currencyCode: row.currency_code,
    validityDays: row.validity_days,
    status: row.status,
    totalAmount: Number(row.total_amount),
    hasIncompletePricing: row.has_incomplete_pricing,
    revision: row.revision,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEstimateSectionRow(row: EstimateSectionRow): EstimateSection {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    name: row.name,
    sortOrder: row.sort_order,
    showSubtotal: row.show_subtotal,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEstimateItemRow(row: EstimateItemRow): EstimateItem {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    sectionId: row.section_id,
    lineType: row.line_type,
    productId: row.product_id,
    serviceId: row.service_id,
    position: row.position,
    skuSnapshot: row.sku_snapshot,
    productNameSnapshot: row.product_name_snapshot,
    sourceUnitPrice: nullableNumber(row.source_unit_price),
    sourceCurrencyCode: row.source_currency_code,
    sourceSnapshotAt: row.source_snapshot_at,
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    sellingUnitPrice: nullableNumber(row.selling_unit_price),
    lineTotal: nullableNumber(row.line_total),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPartnerServiceRow(row: PartnerServiceRow): PartnerService {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    defaultUnit: row.default_unit,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

export function mapEstimateAggregateRow(
  row: EstimateRow & { estimate_sections: EstimateSectionRow[]; estimate_items: EstimateItemRow[] },
): EstimateAggregate {
  return {
    estimate: mapEstimateRow(row),
    sections: row.estimate_sections.map(mapEstimateSectionRow).sort((left, right) => left.sortOrder - right.sortOrder),
    items: row.estimate_items.map(mapEstimateItemRow).sort((left, right) => left.position - right.position),
  };
}

function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}
