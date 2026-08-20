import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";
import type { PartnerCommercialProfileSourceDTO } from "@/src/modules/integration/dto";

import type {
  AdminCompanyRepository,
  ListAdminCompaniesRepositoryInput,
} from "../admin-company.repository";
import type {
  AdminCompanyOverview,
  AdminCompanyPage,
  AdminCompanySummary,
  AdminCompanyAccess,
  AdminCompanyContractMappingProjection,
  AdminCommercialProfileSyncResult,
  AdminContractMappingResult,
  PartnerAccessPresetCode,
} from "../../types";

type AdminCompanyRow = {
  company_id: string;
  display_name: string;
  fiscal_code: string | null;
  company_status: string;
  counterparty_mapping_state: string;
  organization_mapping_state: string;
  active_membership_count: number | string;
  active_owner_count: number | string;
  pending_invitation_count: number | string;
  partner_price_type: string | null;
  finance_sync_state: string;
  commercial_state: string;
  last_commercial_at: string | null;
  warning_codes: string[] | null;
  total_count: number | string;
};

type AdminCompanyOverviewRow = {
  company_id: string;
  display_name: string;
  fiscal_code: string | null;
  company_status: string;
  external_1c_id: string | null;
  external_1c_code: string | null;
  external_1c_contract_id: string | null;
  external_1c_price_type_id: string | null;
  partner_price_type: string | null;
  organization_mapping_state: string;
  active_membership_count: number | string;
  active_owner_count: number | string;
  pending_invitation_count: number | string;
  active_owner_name: string | null;
  finance_sync_state: string;
  finance_last_success_at: string | null;
  latest_access_event_type: string | null;
  latest_access_event_at: string | null;
  warning_codes: string[] | null;
};

export class SupabaseAdminCompanyRepository implements AdminCompanyRepository {
  async list(
    input: ListAdminCompaniesRepositoryInput,
  ): Promise<AdminCompanyPage> {
    const rows = await this.call<AdminCompanyRow[]>("list_admin_companies", {
      p_page: input.page,
      p_page_size: input.pageSize,
      p_search: input.search || null,
      p_filter: input.filter,
    });
    const totalCount = Number(rows[0]?.total_count ?? 0);

    return {
      records: rows.map(mapCompanySummary),
      page: input.page,
      pageSize: input.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize)),
      search: input.search,
      filter: input.filter,
    };
  }

  async getOverview(companyId: string): Promise<AdminCompanyOverview | null> {
    const rows = await this.call<AdminCompanyOverviewRow[]>(
      "get_admin_company_overview",
      { p_company_id: companyId },
    );
    const row = rows[0];
    if (!row) return null;

    return {
      companyId: row.company_id,
      displayName: row.display_name,
      fiscalCode: row.fiscal_code,
      companyStatus: row.company_status,
      external1cId: row.external_1c_id,
      external1cCode: row.external_1c_code,
      external1cContractId: row.external_1c_contract_id,
      external1cPriceTypeId: row.external_1c_price_type_id,
      partnerPriceType: row.partner_price_type,
      organizationMappingState: row.organization_mapping_state,
      activeMembershipCount: Number(row.active_membership_count),
      activeOwnerCount: Number(row.active_owner_count),
      pendingInvitationCount: Number(row.pending_invitation_count),
      activeOwnerName: row.active_owner_name,
      financeSyncState: row.finance_sync_state,
      financeLastSuccessAt: row.finance_last_success_at,
      latestAccessEventType: row.latest_access_event_type,
      latestAccessEventAt: row.latest_access_event_at,
      warningCodes: row.warning_codes ?? [],
    };
  }

  async getAccess(companyId: string): Promise<AdminCompanyAccess | null> {
    return this.call<AdminCompanyAccess | null>("get_admin_partner_company_access", {
      p_company_id: companyId,
    });
  }

  async getContractMapping(companyId: string): Promise<AdminCompanyContractMappingProjection | null> {
    return this.call<AdminCompanyContractMappingProjection | null>(
      "get_admin_partner_contract_mapping",
      { p_company_id: companyId },
    );
  }

  async mapContract(input: {
    companyId: string;
    contractRef: string;
    expectedVersion: number;
    reason: string;
    correlationId: string;
  }): Promise<AdminContractMappingResult> {
    return this.call<AdminContractMappingResult>(
      "map_admin_partner_company_contract",
      {
        p_company_id: input.companyId,
        p_contract_ref: input.contractRef,
        p_expected_version: input.expectedVersion,
        p_reason: input.reason,
        p_correlation_id: input.correlationId,
      },
    );
  }

  async beginCommercialProfileSync(input: {
    companyId: string;
    expectedVersion: number;
    reason: string;
    correlationId: string;
  }): Promise<AdminCommercialProfileSyncResult> {
    return this.call<AdminCommercialProfileSyncResult>(
      "begin_admin_partner_commercial_profile_sync",
      {
        p_company_id: input.companyId,
        p_expected_version: input.expectedVersion,
        p_reason: input.reason,
        p_correlation_id: input.correlationId,
      },
    );
  }

  async publishCommercialProfileSync(
    runId: string,
    source: PartnerCommercialProfileSourceDTO,
  ): Promise<AdminCommercialProfileSyncResult> {
    const { data, error } = await createAdminClient().rpc(
      "publish_partner_commercial_profile_sync",
      { p_run_id: runId, p_source: source },
    );
    if (error || data === null) {
      throw new RepositoryUnexpectedError({
        operation: "publish_partner_commercial_profile_sync",
        table: "partner_company_commercial_profile_sync_runs",
        payloadKeys: ["p_run_id", "p_source"],
        cause: error,
      });
    }
    return data as AdminCommercialProfileSyncResult;
  }

  async failCommercialProfileSync(runId: string, reason: string): Promise<void> {
    const { error } = await createAdminClient().rpc(
      "fail_partner_commercial_profile_sync",
      { p_run_id: runId, p_safe_reason: reason },
    );
    if (error) {
      console.error({
        event: "admin_commercial_profile_sync_failure_record_failed",
        runId,
        errorCode: error.code ?? null,
      });
    }
  }

  async updateAccess(input: {
    companyId: string;
    expectedVersion: number;
    presetCode: PartnerAccessPresetCode;
    enabledPermissionCodes: string[];
    note: string | null;
    correlationId: string;
  }): Promise<{ version: number; correlationId: string }> {
    const supabase = await createClient();
    const payload = {
      p_company_id: input.companyId,
      p_expected_version: input.expectedVersion,
      p_preset_code: input.presetCode,
      p_enabled_permission_codes: input.enabledPermissionCodes,
      p_note: input.note,
      p_correlation_id: input.correlationId,
    };
    const { data, error } = await supabase.rpc(
      "update_admin_partner_company_access",
      payload,
    );
    if (error?.code === "PT409" || error?.message.includes("stale_company_access_version")) {
      throw new Error("stale_company_access_version");
    }
    if (error || data === null) {
      throw new RepositoryUnexpectedError({
        operation: "update_admin_partner_company_access",
        table: "partner_company_access_policies",
        payloadKeys: Object.keys(payload),
        cause: error,
      });
    }
    return data as { version: number; correlationId: string };
  }

  private async call<T>(
    operation: string,
    input: Record<string, unknown>,
  ): Promise<T> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(operation, input);
    if (error || data === null) {
      throw new RepositoryUnexpectedError({
        operation,
        table: "admin_company_projection",
        payloadKeys: Object.keys(input),
        cause: error,
      });
    }
    return data as T;
  }
}

function mapCompanySummary(row: AdminCompanyRow): AdminCompanySummary {
  return {
    companyId: row.company_id,
    displayName: row.display_name,
    fiscalCode: row.fiscal_code,
    companyStatus: row.company_status,
    counterpartyMappingState: row.counterparty_mapping_state,
    organizationMappingState: row.organization_mapping_state,
    activeMembershipCount: Number(row.active_membership_count),
    activeOwnerCount: Number(row.active_owner_count),
    pendingInvitationCount: Number(row.pending_invitation_count),
    partnerPriceType: row.partner_price_type,
    financeSyncState: row.finance_sync_state,
    commercialState: row.commercial_state,
    lastCommercialAt: row.last_commercial_at,
    warningCodes: row.warning_codes ?? [],
  };
}
