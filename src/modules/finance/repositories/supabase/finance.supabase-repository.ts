import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { FinanceRepository, PublishContractBalanceSnapshotInput } from "../finance.repository";
import type { PartnerContractBalance } from "../../types";
import type { FinanceSyncCompany, FinanceSyncState } from "../../types";
import type { ContractBalanceFetchDiagnosticsDTO } from "../../../integration/contracts";

const COLUMNS = "id,company_id,external_contract_ref,contract_number,contract_name,currency_ref,currency_code,signed_balance,source_version,synchronized_at";

type Row = {
  id: string;
  company_id: string;
  external_contract_ref: string;
  contract_number: string;
  contract_name: string;
  currency_ref: string;
  currency_code: string;
  signed_balance: string | number;
  source_version: string | null;
  synchronized_at: string;
};

type SyncStateRow = {
  company_id: string;
  status: FinanceSyncState["status"];
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error_code: string | null;
  received_count: number;
  published_count: number;
  excluded_deleted_count: number;
  source_version: string | null;
  last_duration_ms: number | null;
};

export class FinanceRepositoryError extends Error {
  constructor() {
    super("Finance repository operation failed.");
    this.name = "FinanceRepositoryError";
  }
}

export class SupabaseFinanceRepository implements FinanceRepository {
  async canRunFinanceSync(): Promise<boolean> {
    const { data, error } = await (await createClient()).rpc("can_run_partner_finance_sync");
    if (error || typeof data !== "boolean") throw new FinanceRepositoryError();
    return data;
  }
  async getOverviewData(companyId: string): Promise<{ balances: PartnerContractBalance[]; syncState: FinanceSyncState | null }> {
    const { data, error } = await (await createClient()).rpc("get_partner_finance_overview", { p_company_id: companyId });
    if (error || !isRecord(data) || !Array.isArray(data.balances)) throw new FinanceRepositoryError();
    return {
      balances: (data.balances as Row[]).map(mapRow),
      syncState: isSyncStateRow(data.sync_state) ? mapSyncState(data.sync_state) : null,
    };
  }

  async listActiveContractBalances(companyId: string): Promise<PartnerContractBalance[]> {
    const { data, error } = await (await createClient())
      .from("partner_contract_balances")
      .select(COLUMNS)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("currency_code")
      .order("contract_name")
      .order("id");
    if (error) throw new FinanceRepositoryError();
    return ((data ?? []) as Row[]).map(mapRow);
  }

  async publishContractBalanceSnapshot(input: PublishContractBalanceSnapshotInput): Promise<number> {
    const { data, error } = await createAdminClient().rpc("publish_partner_contract_balances", {
      p_company_id: input.companyId,
      p_counterparty_ref: input.counterpartyRef,
      p_synchronized_at: input.synchronizedAt,
      p_rows: input.rows.map((row) => ({
        external_contract_ref: row.contractReference.externalId,
        contract_number: row.contractNumber,
        contract_name: row.contractName,
        currency_ref: row.currencyReference.externalId,
        currency_code: row.currencyCode,
        signed_balance: row.signedBalance,
        source_version: row.sourceVersion,
      })),
    });
    if (error || typeof data !== "number") throw new FinanceRepositoryError();
    return data;
  }

  async getSyncCompany(companyId: string): Promise<FinanceSyncCompany | null> {
    const client = createAdminClient();
    const [{ data: company, error }, { count, error: countError }] = await Promise.all([
      client.from("partner_companies").select("id,display_name,external_1c_id").eq("id", companyId).eq("status", "active").maybeSingle(),
      client.from("partner_contract_balances").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
    ]);
    if (error || countError) throw new FinanceRepositoryError();
    if (!company) return null;
    return { companyId: company.id, companyName: company.display_name, counterpartyRef: company.external_1c_id, activeBalanceCount: count ?? 0 };
  }

  async listSyncCompanies(input: { afterCompanyId?: string; limit: number }): Promise<FinanceSyncCompany[]> {
    const client = createAdminClient();
    let query = client.from("partner_companies").select("id,display_name,external_1c_id").eq("status", "active").order("id").limit(input.limit);
    if (input.afterCompanyId) query = query.gt("id", input.afterCompanyId);
    const { data, error } = await query;
    if (error) throw new FinanceRepositoryError();
    const companies = data ?? [];
    if (!companies.length) return [];
    const { data: balances, error: balanceError } = await client.from("partner_contract_balances").select("company_id").in("company_id", companies.map((row) => row.id)).eq("is_active", true);
    if (balanceError) throw new FinanceRepositoryError();
    const counts = new Map<string, number>();
    for (const row of balances ?? []) counts.set(row.company_id, (counts.get(row.company_id) ?? 0) + 1);
    return companies.map((company) => ({
      companyId: company.id,
      companyName: company.display_name,
      counterpartyRef: company.external_1c_id,
      activeBalanceCount: counts.get(company.id) ?? 0,
    }));
  }

  async publishContractBalanceSnapshotV2(input: PublishContractBalanceSnapshotInput & {
    durationMs: number;
    diagnostics: ContractBalanceFetchDiagnosticsDTO;
    trigger: "manual" | "scheduled";
    actorUserId: string | null;
  }): Promise<number> {
    const { data, error } = await createAdminClient().rpc("publish_partner_contract_balances_v2", {
      p_company_id: input.companyId,
      p_counterparty_ref: input.counterpartyRef,
      p_synchronized_at: input.synchronizedAt,
      p_rows: toPublishRows(input),
      p_received_count: input.diagnostics.rawBalanceCount,
      p_excluded_deleted_count: input.diagnostics.deletedContractCount,
      p_duration_ms: input.durationMs,
      p_trigger: input.trigger,
      p_actor_user_id: input.actorUserId,
    });
    if (error || typeof data !== "number") throw new FinanceRepositoryError();
    return data;
  }

  async recordSyncResult(input: {
    companyId: string;
    status: "running" | "failed" | "mapping_missing" | "locked";
    trigger: "manual" | "scheduled";
    actorUserId: string | null;
    errorCode?: string;
    durationMs?: number;
  }): Promise<void> {
    const { error } = await createAdminClient().rpc("record_partner_finance_sync_result", {
      p_company_id: input.companyId,
      p_status: input.status,
      p_trigger: input.trigger,
      p_actor_user_id: input.actorUserId,
      p_error_code: input.errorCode ?? null,
      p_duration_ms: input.durationMs ?? null,
    });
    if (error) throw new FinanceRepositoryError();
  }
}

function toPublishRows(input: PublishContractBalanceSnapshotInput) {
  return input.rows.map((row) => ({
    external_contract_ref: row.contractReference.externalId,
    contract_number: row.contractNumber,
    contract_name: row.contractName,
    currency_ref: row.currencyReference.externalId,
    currency_code: row.currencyCode,
    signed_balance: row.signedBalance,
    source_version: row.sourceVersion,
  }));
}

function mapRow(row: Row): PartnerContractBalance {
  return {
    id: row.id,
    companyId: row.company_id,
    externalContractRef: row.external_contract_ref,
    contractNumber: row.contract_number,
    contractName: row.contract_name,
    currencyRef: row.currency_ref,
    currencyCode: row.currency_code,
    signedBalance: String(row.signed_balance),
    sourceVersion: row.source_version,
    synchronizedAt: row.synchronized_at,
  };
}

function mapSyncState(row: SyncStateRow): FinanceSyncState {
  return {
    companyId: row.company_id, status: row.status, lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at, lastErrorCode: row.last_error_code,
    receivedCount: row.received_count, publishedCount: row.published_count,
    excludedDeletedCount: row.excluded_deleted_count, sourceVersion: row.source_version,
    lastDurationMs: row.last_duration_ms,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSyncStateRow(value: unknown): value is SyncStateRow {
  return isRecord(value) && typeof value.company_id === "string" && typeof value.status === "string";
}
