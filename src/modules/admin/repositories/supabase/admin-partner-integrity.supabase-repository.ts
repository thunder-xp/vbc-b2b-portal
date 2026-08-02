import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type { AdminPartnerIntegrityRepository, PartnerIntegrityRepairInput, PartnerMembershipMutationInput } from "../admin-partner-integrity.repository";
import type { AdminPartnerUserIntegrity, OnboardingIntegrityDiagnostic, PartnerIntegrityRepairResult, PartnerIntegrityTargetCompany } from "../../types";

export class SupabaseAdminPartnerIntegrityRepository implements AdminPartnerIntegrityRepository {
  getUser(profileId: string): Promise<AdminPartnerUserIntegrity | null> {
    return this.call("get_admin_partner_user_integrity", { p_profile_id: profileId }, "partner_integrity_user");
  }

  diagnose(requestId: string): Promise<OnboardingIntegrityDiagnostic | null> {
    return this.call("get_approved_onboarding_integrity", { p_request_id: requestId }, "onboarding_integrity");
  }

  listTargetCompanies(search: string): Promise<PartnerIntegrityTargetCompany[]> {
    return this.call<Array<{ company_id: string; display_name: string; status: string; external_1c_id: string }>>(
      "list_partner_integrity_target_companies",
      { p_search: search || null },
      "partner_integrity_targets",
    ).then((rows) => rows.map((row) => ({
      companyId: row.company_id,
      displayName: row.display_name,
      status: row.status,
      external1cId: row.external_1c_id,
    })));
  }

  repairApprovedRequest(input: PartnerIntegrityRepairInput): Promise<PartnerIntegrityRepairResult> {
    return this.call("repair_approved_onboarding_connection", repairPayload(input), "partner_integrity_repairs");
  }

  mutateMembership(input: PartnerMembershipMutationInput): Promise<PartnerIntegrityRepairResult> {
    return this.call("admin_move_or_add_company_membership", {
      p_user_id: input.userId,
      p_source_membership_id: input.sourceMembershipId,
      p_target_company_id: input.targetCompanyId,
      p_expected_source_version: input.expectedSourceVersion,
      p_mode: input.mode,
      p_role_code: input.roleCode,
      p_reason: input.reason,
      p_operation_key: input.operationKey,
      p_correlation_id: input.correlationId,
    }, "partner_integrity_repairs");
  }

  private async call<T>(operation: string, input: Record<string, unknown>, table: string): Promise<T> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(operation, input);
    if (error?.code === "PT409" || error?.message.includes("stale_membership_version")) {
      throw new Error("stale_membership_version");
    }
    if (error || data === null) {
      throw new RepositoryUnexpectedError({ operation, table, payloadKeys: Object.keys(input), cause: error });
    }
    return data as T;
  }
}

function repairPayload(input: PartnerIntegrityRepairInput): Record<string, unknown> {
  return {
    p_request_id: input.requestId,
    p_counterparty_id: input.counterpartyId,
    p_source_membership_id: input.sourceMembershipId,
    p_expected_source_version: input.expectedSourceVersion,
    p_mode: input.mode,
    p_role_code: input.roleCode,
    p_reason: input.reason,
    p_operation_key: input.operationKey,
    p_correlation_id: input.correlationId,
  };
}
