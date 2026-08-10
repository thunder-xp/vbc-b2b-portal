import { createClient } from "@/src/lib/supabase/server";

import type { ExternalNomenclatureRecord, ProposalGeneratorRepository } from "..";
import { EstimateRepositoryError } from "../estimate.repository";

function fail(code?: string): never {
  throw new EstimateRepositoryError(code === "40001" || code === "23505" ? "conflict" : code === "42501" ? "not_found" : code === "22023" ? "invalid" : "persistence");
}

export class SupabaseProposalGeneratorRepository implements ProposalGeneratorRepository {
  async recordSession(input: Parameters<ProposalGeneratorRepository["recordSession"]>[0]): Promise<string> {
    const { data, error } = await (await createClient()).rpc("record_estimate_generator_session", {
      target_company_id: input.companyId,
      target_request_key: input.requestKey,
      target_request_fingerprint: input.fingerprint,
      target_requirement_count: input.requirementCount,
      target_duration_ms: input.durationMs,
      target_failed: input.failed ?? false,
    });
    if (error || !data) fail(error?.code);
    return String(data);
  }

  async resolveExternalNomenclature(companyId: string, ids: string[]): Promise<ExternalNomenclatureRecord[]> {
    if (!ids.length) return [];
    const { data, error } = await (await createClient()).rpc("resolve_generator_external_nomenclature", { target_company_id: companyId, target_ids: ids });
    if (error) fail(error.code);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id), itemType: row.item_type as ExternalNomenclatureRecord["itemType"],
      manufacturer: typeof row.manufacturer === "string" ? row.manufacturer : null,
      model: typeof row.model === "string" ? row.model : null, name: String(row.name),
      category: typeof row.category === "string" ? row.category : null, unit: row.unit as ExternalNomenclatureRecord["unit"],
      specification: typeof row.specification === "string" ? row.specification : null,
      curationStatus: "active", hasCover: false, coverScope: null, exactIdentityMatch: true,
    }));
  }

  async createEstimate(input: Parameters<ProposalGeneratorRepository["createEstimate"]>[0]): Promise<string> {
    const lines = input.lines.map((line) => ({
      section_key: line.sectionKey, line_type: line.lineType, resolution: line.resolution,
      product_id: line.productId, external_nomenclature_id: line.externalNomenclatureId ?? null,
      sku_snapshot: line.skuSnapshot, product_name_snapshot: line.productNameSnapshot,
      source_unit_price: line.sourceUnitPrice, source_currency_code: line.sourceCurrencyCode,
      source_snapshot_at: line.sourceSnapshotAt, internal_cost_unit_price: line.internalCostUnitPrice ?? null,
      converted_cost_unit_price: line.convertedCostUnitPrice ?? null, exchange_rate: line.exchangeRate ?? null,
      exchange_rate_effective_date: line.exchangeRateEffectiveDate ?? null, description: line.description,
      quantity: line.quantity, unit: line.unit, selling_unit_price: line.sellingUnitPrice,
    }));
    const { data, error } = await (await createClient()).rpc("create_estimate_from_generator", {
      target_company_id: input.companyId, target_session_id: input.sessionId, target_final_customer_id: input.finalCustomerId,
      estimate_name: input.name, target_project_name: input.projectName ?? "", target_currency_code: input.currencyCode,
      target_validity_days: input.validityDays, target_request_key: input.requestKey,
      target_request_fingerprint: input.fingerprint, generated_lines: lines,
    });
    if (error || !data) fail(error?.code);
    return String(data);
  }

  async submitFeedback(input: Parameters<ProposalGeneratorRepository["submitFeedback"]>[0]): Promise<string> {
    const { data, error } = await (await createClient()).rpc("submit_estimate_generator_feedback", {
      target_session_id: input.sessionId, target_answer: input.answer, target_comment: input.comment,
    });
    if (error || !data) fail(error?.code);
    return String(data);
  }

  async canPromptFeedback(sessionId: string, estimateId: string): Promise<boolean> {
    const { data, error } = await (await createClient()).rpc("can_prompt_estimate_generator_feedback", { target_session_id: sessionId, target_estimate_id: estimateId });
    if (error) fail(error.code);
    return data === true;
  }

  async getAdminReport(limit: number) {
    const { data, error } = await (await createClient()).rpc("get_estimate_generator_admin_report", { result_limit: limit });
    if (error || !data) fail(error?.code);
    return data as unknown as Awaited<ReturnType<ProposalGeneratorRepository["getAdminReport"]>>;
  }
}
