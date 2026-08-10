import { createClient } from "@/src/lib/supabase/server";

import type { ExternalNomenclatureRecord, ProposalGeneratorRepository } from "..";
import { EstimateRepositoryError } from "../estimate.repository";

function fail(code?: string): never {
  throw new EstimateRepositoryError(code === "40001" || code === "23505" ? "conflict" : code === "42501" ? "not_found" : code === "22023" ? "invalid" : "persistence");
}

export class SupabaseProposalGeneratorRepository implements ProposalGeneratorRepository {
  async recordSession(input: Parameters<ProposalGeneratorRepository["recordSession"]>[0]): Promise<string> {
    const counts = input.resolutionCounts ?? { catalog: 0, service: 0, own: 0, shared: 0, unresolved: input.requirementCount };
    const { data, error } = await (await createClient()).rpc("record_estimate_generator_session_v3", {
      target_company_id: input.companyId,
      target_request_key: input.requestKey,
      target_request_fingerprint: input.fingerprint,
      target_requirement_count: input.requirementCount,
      target_duration_ms: input.durationMs,
      target_failed: input.failed ?? false,
      target_generation_mode: input.generationMode ?? "description",
      target_structured_facts: input.structuredFacts ?? null,
      target_resolved_catalog_count: counts.catalog,
      target_resolved_service_count: counts.service,
      target_own_nomenclature_count: counts.own,
      target_shared_nomenclature_count: counts.shared,
      target_unresolved_count: counts.unresolved,
    });
    if (error || !data) fail(error?.code);
    return String(data);
  }

  async resolveCalculatorProfiles(companyId: string, profileKeys: string[]) {
    if (!profileKeys.length) return [];
    const { data, error } = await (await createClient()).rpc("resolve_estimate_generator_calculator_profiles", {
      target_company_id: companyId, target_profile_keys: profileKeys,
    });
    if (error) fail(error.code);
    return (data ?? []).map(mapProfile);
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

  async resolveServices(companyId: string, ids: string[]) {
    if (!ids.length) return [];
    const { data, error } = await (await createClient()).rpc("resolve_generator_services", {
      target_company_id: companyId, target_ids: ids,
    });
    if (error) fail(error.code);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id), name: String(row.name),
      unit: row.default_unit as import("../../types").EstimateUnit,
      defaultCost: nullableNumber(row.default_cost), defaultSellingPrice: nullableNumber(row.default_selling_price),
    }));
  }

  async createEstimate(input: Parameters<ProposalGeneratorRepository["createEstimate"]>[0]): Promise<string> {
    const lines = input.lines.map((line) => ({
      section_key: line.sectionKey, line_type: line.lineType, resolution: line.resolution,
      product_id: line.productId, service_id: line.serviceId, external_nomenclature_id: line.externalNomenclatureId ?? null,
      sku_snapshot: line.skuSnapshot, product_name_snapshot: line.productNameSnapshot,
      source_unit_price: line.sourceUnitPrice, source_currency_code: line.sourceCurrencyCode,
      source_snapshot_at: line.sourceSnapshotAt, internal_cost_unit_price: line.internalCostUnitPrice ?? null,
      converted_cost_unit_price: line.convertedCostUnitPrice ?? null, exchange_rate: line.exchangeRate ?? null,
      exchange_rate_effective_date: line.exchangeRateEffectiveDate ?? null, description: line.description,
      quantity: line.quantity, unit: line.unit, selling_unit_price: line.sellingUnitPrice,
      profile_key: line.profileKey ?? null,
    }));
    const { data, error } = await (await createClient()).rpc("create_estimate_from_generator_v2", {
      target_company_id: input.companyId, target_session_id: input.sessionId, target_final_customer_id: input.finalCustomerId,
      estimate_name: input.name, target_project_name: input.projectName ?? "", target_currency_code: input.currencyCode,
      target_vat_mode: input.vatMode,
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

  async listCalculatorProfiles() {
    const { data, error } = await (await createClient()).rpc("list_estimate_generator_calculator_profiles");
    if (error) fail(error.code);
    return (data ?? []).map((row: Record<string, unknown>) => ({ ...mapProfile(row), systemType: "cctv" as const, isActive: row.is_active === true }));
  }

  async searchCalculatorTargets(query: string, limit: number) {
    const { data, error } = await (await createClient()).rpc("search_estimate_generator_mapping_targets", { search_query: query, result_limit: limit });
    if (error) fail(error.code);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      targetType: row.target_type as "catalog" | "service" | "external_nomenclature", id: String(row.id), label: String(row.label),
      secondary: typeof row.secondary === "string" ? row.secondary : null,
    }));
  }

  async updateCalculatorProfile(input: Parameters<ProposalGeneratorRepository["updateCalculatorProfile"]>[0]) {
    const { data, error } = await (await createClient()).rpc("update_estimate_generator_calculator_profile", {
      target_profile_key: input.profileKey, expected_version: input.expectedVersion,
      target_type: input.targetType, target_id: input.targetId,
    });
    if (error || data === null) fail(error?.code);
    return Number(data);
  }

  async updateCalculatorServicePrice(input: Parameters<ProposalGeneratorRepository["updateCalculatorServicePrice"]>[0]) {
    const { data, error } = await (await createClient()).rpc("update_estimate_generator_service_default_price", {
      target_profile_key: input.profileKey, expected_version: input.expectedVersion,
      target_unit_price: input.unitPrice, target_currency_code: input.currencyCode, target_vat_mode: input.vatMode,
    });
    if (error || data === null) fail(error?.code);
    return Number(data);
  }
}

function mapProfile(row: Record<string, unknown>) {
  return {
    profileKey: String(row.profile_key), label: String(row.label),
    sectionKey: row.section_key as import("../../types").EstimateSectionSystemKey,
    unit: row.unit as import("../estimate.repository").AddEstimateLineInput["unit"], version: Number(row.version),
    resolution: row.resolution as "unresolved" | "catalog" | "service" | "own_nomenclature" | "shared_nomenclature",
    resolvedId: typeof row.resolved_id === "string" ? row.resolved_id : null,
    resolvedLabel: typeof row.resolved_label === "string" ? row.resolved_label : null,
    defaultSellingUnitPrice: nullableNumber(row.default_selling_unit_price),
    defaultSellingCurrencyCode: typeof row.default_selling_currency_code === "string" ? row.default_selling_currency_code : null,
    defaultSellingVatMode: row.default_selling_vat_mode === "included" || row.default_selling_vat_mode === "excluded" ? row.default_selling_vat_mode : null,
  };
}

function nullableNumber(value: unknown) {
  return typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : null;
}
