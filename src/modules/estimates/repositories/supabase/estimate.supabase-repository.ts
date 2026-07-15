import { createClient } from "@/src/lib/supabase/server";

import type {
  AddEstimateLineInput,
  CreateEstimateInput,
  EstimateListInput,
  EstimateListRecord,
  EstimateRepository,
} from "../estimate.repository";
import { EstimateRepositoryError } from "../estimate.repository";
import type { Estimate, EstimateAggregate, PartnerService } from "../../types";
import {
  mapEstimateAggregateRow,
  mapEstimateRow,
  mapPartnerServiceRow,
  type EstimateItemRow,
  type EstimateRow,
  type EstimateSectionRow,
  type PartnerServiceRow,
} from "./mappers";

const ESTIMATE_COLUMNS = "id, company_id, created_by, estimate_number, name, customer_name, project_name, currency_code, validity_days, status, total_amount, has_incomplete_pricing, revision, archived_at, created_at, updated_at";
const SECTION_COLUMNS = "id, estimate_id, name, sort_order, show_subtotal, created_at, updated_at";
const ITEM_COLUMNS = "id, estimate_id, section_id, line_type, product_id, service_id, position, sku_snapshot, product_name_snapshot, source_unit_price, source_currency_code, source_snapshot_at, description, quantity, unit, selling_unit_price, line_total, created_at, updated_at";

type EstimateListRow = EstimateRow & {
  estimate_items: Array<{ count: number }>;
  creator: { full_name: string | null } | null;
};

type EstimateAggregateRow = EstimateRow & {
  estimate_sections: EstimateSectionRow[];
  estimate_items: EstimateItemRow[];
};

export class SupabaseEstimateRepository implements EstimateRepository {
  async list(input: EstimateListInput): Promise<{ records: EstimateListRecord[]; totalCount: number }> {
    const supabase = await createClient();
    let query = supabase
      .from("estimates")
      .select(`${ESTIMATE_COLUMNS}, estimate_items(count), creator:user_profiles!estimates_created_by_fkey(full_name)`, { count: "exact" })
      .eq("company_id", input.companyId)
      .order("updated_at", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1);

    if (input.status) query = query.eq("status", input.status);
    if (input.dateFrom) query = query.gte("updated_at", input.dateFrom);
    if (input.dateTo) query = query.lt("updated_at", input.dateTo);
    if (input.search) {
      const pattern = `%${escapePostgrestPattern(input.search)}%`;
      query = query.or(`estimate_number.ilike.${pattern},name.ilike.${pattern},customer_name.ilike.${pattern},project_name.ilike.${pattern}`);
    }

    const { data, error, count } = await query;
    if (error) throw mapRepositoryError(error.code);

    return {
      records: (data as unknown as EstimateListRow[]).map((row) => ({
        ...mapEstimateRow(row),
        itemCount: row.estimate_items[0]?.count ?? 0,
        createdByName: row.creator?.full_name?.trim() || "Пользователь компании",
      })),
      totalCount: count ?? 0,
    };
  }

  async findAggregateById(estimateId: string): Promise<EstimateAggregate | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("estimates")
      .select(`${ESTIMATE_COLUMNS}, estimate_sections(${SECTION_COLUMNS}), estimate_items(${ITEM_COLUMNS})`)
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
      .select("id, company_id, name, default_unit, description, sort_order")
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
