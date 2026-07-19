import { createClient } from "@/src/lib/supabase/server";

import type {
  AddEstimateLineInput,
  CreateEstimateInput,
  EstimateListInput,
  EstimateListRecord,
  EstimateRepository,
  SaveEstimateCommercialInput,
} from "../estimate.repository";
import { EstimateRepositoryError } from "../estimate.repository";
import type { Estimate, EstimateAggregate, PartnerService } from "../../types";
import {
  mapEstimateAggregateRow,
  mapEstimateRow,
  mapPartnerServiceRow,
  type EstimateItemRow,
  type EstimateChargeRow,
  type EstimateRow,
  type EstimateSectionRow,
  type PartnerServiceRow,
} from "./mappers";

const ESTIMATE_COLUMNS = "id, company_id, created_by, estimate_number, name, customer_name, project_name, currency_code, currency_rate, currency_rate_effective_date, validity_days, global_discount_percent, vat_mode, vat_rate_percent, subtotal_amount, line_discount_total, section_discount_total, global_discount_amount, charges_total, vat_amount, total_excluding_vat, gross_profit_amount, overall_margin_percent, status, total_amount, has_incomplete_pricing, proposal_template_id, proposal_settings, source_estimate_id, source_version_id, accepted_version_id, revision, archived_at, created_at, updated_at";
const SECTION_COLUMNS = "id, estimate_id, name, sort_order, show_subtotal, discount_percent, created_at, updated_at";
const ITEM_COLUMNS = "id, estimate_id, section_id, line_type, product_id, service_id, position, sku_snapshot, product_name_snapshot, source_unit_price, source_currency_code, source_snapshot_at, pricing_mode, pricing_input_value, internal_cost_unit_price, converted_cost_unit_price, exchange_rate, exchange_rate_effective_date, line_discount_percent, description, quantity, unit, selling_unit_price, line_total, line_subtotal, line_discount_amount, net_line_total, created_at, updated_at";
const CHARGE_COLUMNS = "id, estimate_id, charge_type, description, amount, vat_applicable, customer_visible, sort_order, created_at, updated_at";

type EstimateListRow = EstimateRow & {
  estimate_items: Array<{ count: number }>;
  creator: { full_name: string | null } | null;
};

type EstimateAggregateRow = EstimateRow & {
  estimate_sections: EstimateSectionRow[];
  estimate_items: EstimateItemRow[];
  estimate_charges: EstimateChargeRow[];
};

export class SupabaseEstimateRepository implements EstimateRepository {
  async list(input: EstimateListInput): Promise<{ records: EstimateListRecord[]; totalCount: number }> {
    const supabase = await createClient();
    let versionEstimateIds: string[] | null = null;
    if (input.versionStatus) {
      const statuses = input.versionStatus === "has_sent" ? ["sent", "accepted", "rejected"] : [input.versionStatus];
      const { data: matchingVersions, error: matchingVersionError } = await supabase.from("estimate_versions")
        .select("estimate_id").eq("company_id", input.companyId).in("status", statuses);
      if (matchingVersionError) throw mapRepositoryError(matchingVersionError.code);
      versionEstimateIds = [...new Set((matchingVersions ?? []).map((version) => version.estimate_id))];
      if (!versionEstimateIds.length) return { records: [], totalCount: 0 };
    }
    let query = supabase
      .from("estimates")
      .select(`${ESTIMATE_COLUMNS}, estimate_items(count), creator:user_profiles!estimates_created_by_fkey(full_name)`, { count: "exact" })
      .eq("company_id", input.companyId)
      .order("updated_at", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1);

    if (input.status) query = query.eq("status", input.status);
    if (versionEstimateIds) query = query.in("id", versionEstimateIds);
    if (input.dateFrom) query = query.gte("updated_at", input.dateFrom);
    if (input.dateTo) query = query.lt("updated_at", input.dateTo);
    if (input.search) {
      const pattern = `%${escapePostgrestPattern(input.search)}%`;
      query = query.or(`estimate_number.ilike.${pattern},name.ilike.${pattern},customer_name.ilike.${pattern},project_name.ilike.${pattern}`);
    }

    const { data, error, count } = await query;
    if (error) throw mapRepositoryError(error.code);

    const rows = data as unknown as EstimateListRow[];
    const estimateIds = rows.map((row) => row.id);
    const versionMetadata = new Map<string, { count: number; latest: import("../../types").EstimateVersionStatus | null; latestVersionId: string | null }>();
    const latestPdfByVersion = new Map<string, string>();
    if (estimateIds.length) {
      const { data: versions, error: versionError } = await supabase.from("estimate_versions")
        .select("id, estimate_id, version_number, status").in("estimate_id", estimateIds).order("version_number", { ascending: false });
      if (versionError) throw mapRepositoryError(versionError.code);
      for (const version of versions ?? []) {
        const current = versionMetadata.get(version.estimate_id) ?? { count: 0, latest: null, latestVersionId: null };
        versionMetadata.set(version.estimate_id, { count: current.count + 1, latest: current.latest ?? version.status, latestVersionId: current.latestVersionId ?? version.id });
      }
      const versionIds = [...versionMetadata.values()].map((metadata) => metadata.latestVersionId).filter((id): id is string => Boolean(id));
      if (versionIds.length) {
        const { data: documents, error: documentError } = await supabase.from("generated_estimate_documents")
          .select("id, version_id, created_at").in("version_id", versionIds).eq("status", "ready").order("created_at", { ascending: false });
        if (documentError) throw mapRepositoryError(documentError.code);
        for (const document of documents ?? []) if (document.version_id && !latestPdfByVersion.has(document.version_id)) latestPdfByVersion.set(document.version_id, document.id);
      }
    }
    return {
      records: rows.map((row) => ({
        ...mapEstimateRow(row),
        itemCount: row.estimate_items[0]?.count ?? 0,
        createdByName: row.creator?.full_name?.trim() || "Пользователь компании",
        versionCount: versionMetadata.get(row.id)?.count ?? 0,
        latestVersionStatus: versionMetadata.get(row.id)?.latest ?? null,
        latestVersionId: versionMetadata.get(row.id)?.latestVersionId ?? null,
        latestPdfDocumentId: latestPdfByVersion.get(versionMetadata.get(row.id)?.latestVersionId ?? "") ?? null,
        hasAcceptedVersion: Boolean(row.accepted_version_id),
      })),
      totalCount: count ?? 0,
    };
  }

  async findAggregateById(estimateId: string): Promise<EstimateAggregate | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("estimates")
      .select(`${ESTIMATE_COLUMNS}, estimate_sections(${SECTION_COLUMNS}), estimate_items(${ITEM_COLUMNS}), estimate_charges(${CHARGE_COLUMNS})`)
      .eq("id", estimateId)
      .maybeSingle();

    if (error) throw mapRepositoryError(error.code);
    return data ? mapEstimateAggregateRow(data as unknown as EstimateAggregateRow) : null;
  }

  async findById(estimateId: string): Promise<Estimate | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("estimates")
      .select(ESTIMATE_COLUMNS)
      .eq("id", estimateId)
      .maybeSingle();

    if (error) throw mapRepositoryError(error.code);
    return data ? mapEstimateRow(data as EstimateRow) : null;
  }

  async create(input: CreateEstimateInput): Promise<Estimate> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_estimate", {
      target_company_id: input.companyId,
      estimate_name: input.name,
      target_customer_name: input.customerName ?? "",
      target_project_name: input.projectName ?? "",
      target_currency_code: input.currencyCode,
      target_validity_days: input.validityDays,
    });
    if (error || !data) throw mapRepositoryError(error?.code);
    return mapEstimateRow(data as EstimateRow);
  }

  async updateDraft(input: {
    estimateId: string;
    expectedRevision: number;
    name: string;
    customerName: string | null;
    projectName: string | null;
    validityDays: number;
  }): Promise<Estimate> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_estimate_draft", {
      target_estimate_id: input.estimateId,
      expected_revision: input.expectedRevision,
      estimate_name: input.name,
      target_customer_name: input.customerName ?? "",
      target_project_name: input.projectName ?? "",
      target_validity_days: input.validityDays,
    });
    if (error || !data) throw mapRepositoryError(error?.code);
    return mapEstimateRow(data as EstimateRow);
  }

  async saveCommercialDraft(input: SaveEstimateCommercialInput): Promise<Estimate> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_estimate_commercial_draft", {
      target_estimate_id: input.estimateId,
      expected_revision: input.expectedRevision,
      estimate_settings: {
        name: input.settings.name,
        customer_name: input.settings.customerName,
        project_name: input.settings.projectName,
        validity_days: input.settings.validityDays,
        currency_code: input.settings.currencyCode,
        currency_rate: input.settings.currencyRate,
        currency_rate_effective_date: input.settings.currencyRateEffectiveDate,
        vat_mode: input.settings.vatMode,
        vat_rate_percent: input.settings.vatRatePercent,
        global_discount_percent: input.settings.globalDiscountPercent,
      },
      section_payload: input.sections.map((section) => ({ id: section.id, name: section.name, sort_order: section.sortOrder, show_subtotal: section.showSubtotal, discount_percent: section.discountPercent })),
      line_payload: input.lines.map((line) => ({
        id: line.id,
        section_id: line.sectionId,
        position: line.position,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        pricing_mode: line.pricingMode,
        pricing_input_value: line.pricingInputValue,
        internal_cost_unit_price: line.internalCostUnitPrice,
        converted_cost_unit_price: line.convertedCostUnitPrice,
        exchange_rate: line.exchangeRate,
        exchange_rate_effective_date: line.exchangeRateEffectiveDate,
        line_discount_percent: line.lineDiscountPercent,
      })),
      charge_payload: input.charges.map((charge) => ({ id: charge.id, charge_type: charge.chargeType, description: charge.description, amount: charge.amount, vat_applicable: charge.vatApplicable, customer_visible: charge.customerVisible, sort_order: charge.sortOrder })),
    });
    if (error || !data) throw mapRepositoryError(error?.code);
    return mapEstimateRow(data as EstimateRow);
  }

  async addLines(estimateId: string, expectedRevision: number, lines: AddEstimateLineInput[]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_estimate_items", {
      target_estimate_id: estimateId,
      expected_revision: expectedRevision,
      line_items: lines.map(toLinePayload),
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async updateLine(input: {
    estimateId: string;
    itemId: string;
    expectedRevision: number;
    description: string;
    quantity: number;
    unit: AddEstimateLineInput["unit"];
    sellingUnitPrice: number;
  }): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("update_estimate_item", {
      target_estimate_id: input.estimateId,
      target_item_id: input.itemId,
      expected_revision: input.expectedRevision,
      target_description: input.description,
      target_quantity: input.quantity,
      target_unit: input.unit,
      target_selling_unit_price: input.sellingUnitPrice,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async removeLine(estimateId: string, itemId: string, expectedRevision: number): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("remove_estimate_item", {
      target_estimate_id: estimateId,
      target_item_id: itemId,
      expected_revision: expectedRevision,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async removeLines(estimateId: string, itemIds: string[], expectedRevision: number): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("remove_estimate_items", {
      target_estimate_id: estimateId,
      target_item_ids: itemIds,
      expected_revision: expectedRevision,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async archive(estimateId: string, expectedRevision: number): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("archive_estimate", {
      target_estimate_id: estimateId,
      expected_revision: expectedRevision,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async listServices(companyId: string): Promise<PartnerService[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("partner_services")
      .select("id, company_id, name, default_unit, description, sort_order, default_cost, default_selling_price, vat_applicable, category")
      .or(`company_id.is.null,company_id.eq.${companyId}`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw mapRepositoryError(error.code);
    return (data as PartnerServiceRow[]).map(mapPartnerServiceRow);
  }
}

function toLinePayload(line: AddEstimateLineInput) {
  return {
    line_type: line.lineType,
    product_id: line.productId,
    service_id: line.serviceId,
    sku_snapshot: line.skuSnapshot,
    product_name_snapshot: line.productNameSnapshot,
    source_unit_price: line.sourceUnitPrice,
    source_currency_code: line.sourceCurrencyCode,
    source_snapshot_at: line.sourceSnapshotAt,
    internal_cost_unit_price: line.internalCostUnitPrice ?? null,
    converted_cost_unit_price: line.convertedCostUnitPrice ?? null,
    exchange_rate: line.exchangeRate ?? null,
    exchange_rate_effective_date: line.exchangeRateEffectiveDate ?? null,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    selling_unit_price: line.sellingUnitPrice,
  };
}

function mapRepositoryError(code: string | undefined): EstimateRepositoryError {
  if (code === "40001") return new EstimateRepositoryError("conflict");
  if (code === "P0002") return new EstimateRepositoryError("not_found");
  return new EstimateRepositoryError();
}

function escapePostgrestPattern(value: string): string {
  return value.replace(/[%,()]/g, " ").replace(/_/g, "\\_");
}
