import "server-only";

import { createPublicReadClient } from "@/src/lib/supabase/public";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { RetailMarketplaceRepository } from "../retail-marketplace.repository";
import { adminReportSchema, assignmentAdminReportSchema, assignmentResponseSchema, dispatchResultSchema, executionResultSchema, partnerAssignmentsSchema, publicProvidersSchema, tariffSetSchema } from "../../validation";

export class RetailMarketplaceRepositoryError extends Error {
  constructor(readonly code: "invalid" | "conflict" | "forbidden" | "unavailable" = "unavailable") { super("Retail Marketplace operation failed."); this.name = "RetailMarketplaceRepositoryError"; }
}
function fail(code?: string): never { throw new RetailMarketplaceRepositoryError(code === "22023" ? "invalid" : code === "PT409" || code === "23505" ? "conflict" : code === "42501" ? "forbidden" : "unavailable"); }

export class SupabaseRetailMarketplaceRepository implements RetailMarketplaceRepository {
  async getCurrentTariffs(systemType: "cctv") {
    const { data, error } = await createPublicReadClient().rpc("get_current_public_installation_tariffs", { p_system_type: systemType });
    if (error) fail(error.code); return data ? tariffSetSchema.parse(data) : null;
  }
  async listPublicProviders(systemType: "cctv", regionCode: string, locale: "ru" | "ro") {
    const { data, error } = await createPublicReadClient().rpc("list_public_installation_providers", { p_system_type: systemType, p_region_code: regionCode, p_locale: locale });
    if (error) fail(error.code); return publicProvidersSchema.parse(data);
  }
  async getAdminReport() {
    const { data, error } = await (await createClient()).rpc("admin_get_retail_installation_marketplace");
    if (error) fail(error.code); return adminReportSchema.parse(data);
  }
  async saveTariffDraft(input: Parameters<RetailMarketplaceRepository["saveTariffDraft"]>[0]) {
    const { data, error } = await (await createClient()).rpc("admin_save_installation_tariff_draft", { p_tariff_set_id: input.tariffSetId, p_effective_from: input.effectiveFrom, p_currency: input.currency, p_vat_treatment: input.vatTreatment, p_lines: input.lines, p_expected_revision: input.expectedRevision, p_reason: input.reason });
    if (error || !data) fail(error?.code); return String(data);
  }
  async publishTariff(input: Parameters<RetailMarketplaceRepository["publishTariff"]>[0]) {
    const { error } = await (await createClient()).rpc("admin_publish_installation_tariff_set", { p_tariff_set_id: input.tariffSetId, p_expected_revision: input.expectedRevision, p_reason: input.reason });
    if (error) fail(error.code);
  }
  async saveProvider(input: Parameters<RetailMarketplaceRepository["saveProvider"]>[0]) {
    const { data, error } = await (await createClient()).rpc("admin_save_installation_provider", { p_provider_id: input.providerId, p_provider_type: input.providerType, p_backing_id: input.backingId, p_profile: input.profile, p_competencies: input.competencies, p_region_codes: input.regionCodes, p_expected_revision: input.expectedRevision, p_reason: input.reason });
    if (error || !data) fail(error?.code); return String(data);
  }
  async activatePilot(input: Parameters<RetailMarketplaceRepository["activatePilot"]>[0]) {
    const { data, error } = await (await createClient()).rpc("activate_installation_requirement_pilot", { p_retail_order_id: input.retailOrderId, p_selection_mode: input.selectionMode, p_preferred_provider_id: input.preferredProviderId, p_region_code: input.regionCode, p_requested_scheduling_context: input.schedulingContext, p_reason: input.reason, p_idempotency_key: input.idempotencyKey });
    if (error) fail(error.code); return dispatchResultSchema.parse(data);
  }
  async dispatch(requirementId: string) {
    const { data, error } = await (await createClient()).rpc("dispatch_installation_requirement", { p_requirement_id: requirementId, p_source: "automatic" });
    if (error) fail(error.code); return dispatchResultSchema.parse(data);
  }
  async listPartnerAssignments(companyId: string, view: Parameters<RetailMarketplaceRepository["listPartnerAssignments"]>[1]) {
    const { data, error } = await (await createClient()).rpc("partner_list_installation_assignments", { p_company_id: companyId, p_view: view });
    if (error) fail(error.code); return partnerAssignmentsSchema.parse(data);
  }
  async respondToAssignment(input: Parameters<RetailMarketplaceRepository["respondToAssignment"]>[0]) {
    const { data, error } = await (await createClient()).rpc("partner_respond_installation_assignment", { p_company_id: input.companyId, p_attempt_id: input.attemptId, p_decision: input.decision, p_reason_code: input.reasonCode, p_reason_text: input.reasonText, p_idempotency_key: input.idempotencyKey });
    if (error) fail(error.code); return assignmentResponseSchema.parse(data);
  }
  async transitionPartnerExecution(input: Parameters<RetailMarketplaceRepository["transitionPartnerExecution"]>[0]) {
    const { data, error } = await (await createClient()).rpc("partner_transition_installation_execution", { p_company_id: input.companyId, p_execution_id: input.executionId, p_command: input.command, p_expected_revision: input.expectedRevision, p_payload: input.payload, p_idempotency_key: input.idempotencyKey });
    if (error) fail(error.code); return executionResultSchema.parse(data);
  }
  async transitionAdminExecution(input: Parameters<RetailMarketplaceRepository["transitionAdminExecution"]>[0]) {
    const { data, error } = await (await createClient()).rpc("admin_transition_installation_execution", { p_execution_id: input.executionId, p_command: input.command, p_expected_revision: input.expectedRevision, p_payload: input.payload, p_idempotency_key: input.idempotencyKey });
    if (error) fail(error.code); return executionResultSchema.parse(data);
  }
  async getAssignmentAdminReport(limit = 100) {
    const { data, error } = await (await createClient()).rpc("admin_get_installation_assignments", { p_limit: limit });
    if (error) fail(error.code); return assignmentAdminReportSchema.parse(data);
  }
  async reassign(input: Parameters<RetailMarketplaceRepository["reassign"]>[0]) {
    const { data, error } = await (await createClient()).rpc("admin_reassign_installation_requirement", { p_requirement_id: input.requirementId, p_provider_id: input.providerId, p_expected_revision: input.expectedRevision, p_reason: input.reason });
    if (error) fail(error.code); return dispatchResultSchema.parse(data);
  }
  async runAssignmentWorker(limit: number) {
    const { data, error } = await createAdminClient().rpc("run_installation_assignment_worker", { p_limit: limit });
    if (error) fail(error.code); return data as Awaited<ReturnType<RetailMarketplaceRepository["runAssignmentWorker"]>>;
  }
}
