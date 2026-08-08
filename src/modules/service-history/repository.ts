import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import type { AdminOneCServiceHistoryPage, OneCServiceHistoryDetail, ServiceHistoryDiagnostics, ServiceHistorySyncClaim, ServiceSerialEnrichmentClaim, UnifiedServiceHistoryPage } from "./types";

export class ServiceHistoryRepositoryError extends Error {
  constructor(readonly operation: string, readonly code: string | null = null) {
    super("Service history is temporarily unavailable.");
    this.name = "ServiceHistoryRepositoryError";
  }
}

export class ServiceHistoryRepository {
  claim() { return this.adminRpc<ServiceHistorySyncClaim | null>("claim_one_c_service_history_sync", { p_page_size: 100 }); }
  publish(input: { claim: ServiceHistorySyncClaim; rows: unknown[]; pageComplete: boolean }) {
    return this.adminRpc<Record<string, unknown>>("publish_one_c_service_history_page", {
      p_run_id: input.claim.runId,
      p_lock_token: input.claim.lockToken,
      p_skip: input.claim.skip,
      p_rows: input.rows,
      p_page_complete: input.pageComplete,
    });
  }
  async fail(claim: ServiceHistorySyncClaim, code: string) {
    await this.adminRpc("fail_one_c_service_history_sync", { p_run_id: claim.runId, p_lock_token: claim.lockToken, p_error_code: code });
  }
  claimSerialEnrichment(pageSize = 100) {
    return this.adminRpc<ServiceSerialEnrichmentClaim | null>("claim_one_c_service_serial_enrichment", { p_page_size: pageSize });
  }
  publishSerialEnrichment(input: { claim: ServiceSerialEnrichmentClaim; rows: unknown[] }) {
    return this.adminRpc<Record<string, unknown>>("publish_one_c_service_serial_enrichment", {
      p_run_id: input.claim.runId,
      p_lock_token: input.claim.lockToken,
      p_rows: input.rows,
      p_page_complete: input.claim.pageComplete,
    });
  }
  async failSerialEnrichment(claim: ServiceSerialEnrichmentClaim, code: string) {
    await this.adminRpc("fail_one_c_service_serial_enrichment", { p_run_id: claim.runId, p_lock_token: claim.lockToken, p_error_code: code });
  }
  listPartner(input: { companyId: string; query: string; filter: string; page: number }) {
    return this.userRpc<UnifiedServiceHistoryPage>("list_partner_service_history", { p_company_id: input.companyId, p_query: input.query, p_filter: input.filter, p_page: input.page, p_page_size: 20 });
  }
  getPartner(id: string) { return this.userRpc<OneCServiceHistoryDetail | null>("get_partner_one_c_service_history", { p_id: id }); }
  getAdmin(id: string) { return this.userRpc<OneCServiceHistoryDetail | null>("get_admin_one_c_service_history", { p_id: id }); }
  listAdmin(input: { query: string; status: string | null; page: number }) {
    return this.userRpc<AdminOneCServiceHistoryPage>("list_admin_unified_service_history", { p_query: input.query, p_status: input.status, p_page: input.page, p_page_size: 25 });
  }
  diagnostics() { return this.userRpc<ServiceHistoryDiagnostics>("get_one_c_service_history_diagnostics", {}); }

  private async adminRpc<T = null>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await createAdminClient().rpc(name, args);
    if (error) throw new ServiceHistoryRepositoryError(name, error.code);
    return data as T;
  }
  private async userRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await (await createClient()).rpc(name, args);
    if (error) throw new ServiceHistoryRepositoryError(name, error.code);
    return data as T;
  }
}
