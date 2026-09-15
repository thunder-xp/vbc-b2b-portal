import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import type { InstallationMarketplaceRepository } from "./repository";
import type { InstallationMarketplaceAdminReport, InstallationProjectDetail, InstallationProjectSummary, InstallationShortlistPartner, PartnerInstallationProject } from "./types";

export class InstallationMarketplaceRepositoryError extends Error {
  constructor(readonly code: "invalid" | "conflict" | "forbidden" | "unavailable") {
    super("Installation Marketplace operation failed.");
    this.name = "InstallationMarketplaceRepositoryError";
  }
}

function fail(code?: string): never {
  throw new InstallationMarketplaceRepositoryError(code === "22023" ? "invalid" : code === "PT409" || code === "23505" ? "conflict" : code === "42501" ? "forbidden" : "unavailable");
}

async function rpc<T>(name: string, parameters: Record<string, unknown>): Promise<T> {
  const client = await createClient();
  const { data, error } = await client.rpc(name, parameters);
  if (error) fail(error.code);
  return data as T;
}

export class SupabaseInstallationMarketplaceRepository implements InstallationMarketplaceRepository {
  listRegions(locale: "ru" | "ro") { return rpc<Array<{ code: string; name: string }>>("list_public_installation_regions_v1", { p_locale: locale }); }
  isCustomerOrderEligible(orderId: string) { return rpc<boolean>("customer_order_installation_eligible_v1", { p_order_id: orderId }); }
  createProject(input: Parameters<InstallationMarketplaceRepository["createProject"]>[0]) {
    return rpc<{ projectId: string; repeated: boolean }>("create_customer_installation_project_v1", {
      p_source_type: input.sourceType, p_source_order_id: input.sourceOrderId,
      p_source_public_product_id: input.sourcePublicProductId, p_object_type: input.objectType,
      p_locality: input.locality, p_region_code: input.regionCode, p_need_type: input.needType,
      p_description: input.description, p_contact_consent: input.contactConsent, p_creation_key: input.creationKey,
    });
  }
  listCustomerProjects(limit: number, offset: number, locale: "ru" | "ro") {
    return rpc<InstallationProjectSummary[]>("customer_list_installation_projects_v1", { p_limit: limit, p_offset: offset, p_locale: locale });
  }
  getCustomerProject(projectId: string, locale: "ru" | "ro") {
    return rpc<InstallationProjectDetail | null>("customer_get_installation_project_v1", { p_project_id: projectId, p_locale: locale });
  }
  listShortlist(projectId: string, locale: "ru" | "ro", limit: number) {
    return rpc<InstallationShortlistPartner[]>("customer_list_installation_partner_shortlist_v1", { p_project_id: projectId, p_locale: locale, p_limit: limit });
  }
  selectPartner(input: Parameters<InstallationMarketplaceRepository["selectPartner"]>[0]) {
    return rpc<{ assignmentId: string; status: string; repeated: boolean }>("customer_select_installation_partner_v1", { p_project_id: input.projectId, p_provider_id: input.providerId, p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey });
  }
  transitionCustomer(input: Parameters<InstallationMarketplaceRepository["transitionCustomer"]>[0]) {
    return rpc<{ projectId: string; status: string; repeated: boolean }>("customer_transition_installation_project_v1", { p_project_id: input.projectId, p_command: input.command, p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey });
  }
  submitReview(input: Parameters<InstallationMarketplaceRepository["submitReview"]>[0]) {
    return rpc<{ reviewId: string; repeated: boolean }>("customer_submit_installation_review_v1", { p_project_id: input.projectId, p_overall: input.overall, p_workmanship: input.workmanship, p_communication: input.communication, p_agreement: input.agreement, p_comment: input.comment, p_idempotency_key: input.idempotencyKey });
  }
  listPartnerProjects(input: Parameters<InstallationMarketplaceRepository["listPartnerProjects"]>[0]) {
    return rpc<PartnerInstallationProject[]>("partner_list_installation_projects_v1", { p_company_id: input.companyId, p_view: input.view, p_limit: input.limit, p_offset: input.offset, p_locale: input.locale });
  }
  respondPartner(input: Parameters<InstallationMarketplaceRepository["respondPartner"]>[0]) {
    return rpc<{ assignmentId: string; status: string; repeated: boolean }>("partner_respond_installation_project_v1", { p_company_id: input.companyId, p_assignment_id: input.assignmentId, p_decision: input.decision, p_reason: input.reason, p_reason_note: input.reasonNote, p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey });
  }
  transitionPartner(input: Parameters<InstallationMarketplaceRepository["transitionPartner"]>[0]) {
    return rpc<{ projectId: string; status: string; repeated: boolean }>("partner_transition_installation_project_v1", { p_company_id: input.companyId, p_assignment_id: input.assignmentId, p_command: input.command, p_planned_for: input.plannedFor, p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey });
  }
  listAdmin(limit: number, status: string | null) {
    return rpc<InstallationMarketplaceAdminReport>("admin_list_installation_marketplace_v1", { p_limit: limit, p_status: status });
  }
  moderateReview(input: Parameters<InstallationMarketplaceRepository["moderateReview"]>[0]) {
    return rpc<{ reviewId: string; status: string; revision: number }>("admin_moderate_installation_review_v1", { p_review_id: input.reviewId, p_status: input.status, p_expected_revision: input.expectedRevision, p_reason: input.reason, p_correlation_id: input.correlationId });
  }
}
