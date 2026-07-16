import type {
  Estimate,
  EstimateAggregate,
  EstimateCharge,
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
  currency_rate: number | string | null;
  currency_rate_effective_date: string | null;
  validity_days: number;
  global_discount_percent: number | string;
  vat_mode: Estimate["vatMode"];
  vat_rate_percent: number | string;
  subtotal_amount: number | string;
  line_discount_total: number | string;
  section_discount_total: number | string;
  global_discount_amount: number | string;
  charges_total: number | string;
  vat_amount: number | string;
  total_excluding_vat: number | string;
  gross_profit_amount: number | string | null;
  overall_margin_percent: number | string | null;
  status: Estimate["status"];
  total_amount: number | string;
  has_incomplete_pricing: boolean;
  proposal_template_id?: string | null;
  proposal_settings?: Estimate["proposalSettings"];
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
  discount_percent: number | string;
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
  pricing_mode: EstimateItem["pricingMode"];
  pricing_input_value: number | string | null;
  internal_cost_unit_price: number | string | null;
  converted_cost_unit_price: number | string | null;
  exchange_rate: number | string | null;
  exchange_rate_effective_date: string | null;
  line_discount_percent: number | string;
  description: string;
  quantity: number | string;
  unit: EstimateItem["unit"];
  selling_unit_price: number | string | null;
  line_total: number | string | null;
  line_subtotal: number | string | null;
  line_discount_amount: number | string | null;
  net_line_total: number | string | null;
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
  default_cost: number | string | null;
  default_selling_price: number | string | null;
  vat_applicable: boolean;
  category: string;
};

export type EstimateChargeRow = {
  id: string;
  estimate_id: string;
  charge_type: EstimateCharge["chargeType"];
  description: string;
  amount: number | string;
  vat_applicable: boolean;
  customer_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
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
    currencyRate: nullableNumber(row.currency_rate),
    currencyRateEffectiveDate: row.currency_rate_effective_date,
    validityDays: row.validity_days,
    globalDiscountPercent: Number(row.global_discount_percent),
    vatMode: row.vat_mode,
    vatRatePercent: Number(row.vat_rate_percent),
    subtotalAmount: Number(row.subtotal_amount),
    lineDiscountTotal: Number(row.line_discount_total),
    sectionDiscountTotal: Number(row.section_discount_total),
    globalDiscountAmount: Number(row.global_discount_amount),
    chargesTotal: Number(row.charges_total),
    vatAmount: Number(row.vat_amount),
    totalExcludingVat: Number(row.total_excluding_vat),
    grossProfitAmount: nullableNumber(row.gross_profit_amount),
    overallMarginPercent: nullableNumber(row.overall_margin_percent),
    status: row.status,
    totalAmount: Number(row.total_amount),
    hasIncompletePricing: row.has_incomplete_pricing,
    proposalTemplateId: row.proposal_template_id ?? null,
    proposalSettings: row.proposal_settings ?? {},
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
    discountPercent: Number(row.discount_percent),
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
    pricingMode: row.pricing_mode,
    pricingInputValue: nullableNumber(row.pricing_input_value),
    internalCostUnitPrice: nullableNumber(row.internal_cost_unit_price),
    convertedCostUnitPrice: nullableNumber(row.converted_cost_unit_price),
    exchangeRate: nullableNumber(row.exchange_rate),
    exchangeRateEffectiveDate: row.exchange_rate_effective_date,
    lineDiscountPercent: Number(row.line_discount_percent),
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    sellingUnitPrice: nullableNumber(row.selling_unit_price),
    lineTotal: nullableNumber(row.net_line_total),
    lineSubtotal: nullableNumber(row.line_subtotal),
    lineDiscountAmount: nullableNumber(row.line_discount_amount),
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
    defaultCost: nullableNumber(row.default_cost),
    defaultSellingPrice: nullableNumber(row.default_selling_price),
    vatApplicable: row.vat_applicable,
    category: row.category,
  };
}

export function mapEstimateChargeRow(row: EstimateChargeRow): EstimateCharge {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    chargeType: row.charge_type,
    description: row.description,
    amount: Number(row.amount),
    vatApplicable: row.vat_applicable,
    customerVisible: row.customer_visible,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEstimateAggregateRow(
  row: EstimateRow & { estimate_sections: EstimateSectionRow[]; estimate_items: EstimateItemRow[]; estimate_charges: EstimateChargeRow[] },
): EstimateAggregate {
  return {
    estimate: mapEstimateRow(row),
    sections: row.estimate_sections.map(mapEstimateSectionRow).sort((left, right) => left.sortOrder - right.sortOrder),
    items: row.estimate_items.map(mapEstimateItemRow).sort((left, right) => left.position - right.position),
    charges: row.estimate_charges.map(mapEstimateChargeRow).sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}
