import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { FinanceRepository, PublishContractBalanceSnapshotInput, PublishFinanceSnapshotInput } from "../finance.repository";
import type {
  AdminFinanceOperations,
  FinanceReminderCandidate,
  FinanceReminderDryRun,
  PartnerContractBalance,
  PartnerPaymentObligation,
} from "../../types";
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

type FinanceSyncCompanyRow = {
  company_id: string;
  company_name: string;
  counterparty_ref: string;
  active_balance_count: number | string;
};

type ObligationRow = {
  id: string; company_id: string; one_c_order_id: string; order_number: string; order_date: string;
  one_c_counterparty_id: string | null; one_c_contract_id: string | null; one_c_organization_id: string | null;
  schedule_line_number: number; source_order_data_version: string | null; payment_percent: string | number;
  planned_amount: string | number; vat_amount: string | number; currency: string; due_date: string;
  payment_method: string; bank_account_id: string | null; bank_account_name: string | null;
  paid_amount: string | number; remaining_amount: string | number; payment_status: PartnerPaymentObligation["paymentStatus"];
  settlement_last_payment_at: string | null; order_posted: boolean; order_deletion_mark: boolean;
  order_status: string | null; reconciliation_status: PartnerPaymentObligation["reconciliationStatus"];
  unsupported_reason: PartnerPaymentObligation["unsupportedReason"]; source_modified_at: string | null;
  source_observed_at: string; synced_at: string;
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
  async getOverviewData(companyId: string): Promise<{ balances: PartnerContractBalance[]; obligations: PartnerPaymentObligation[]; unavailableCount: number; syncState: FinanceSyncState | null }> {
    const { data, error } = await (await createClient()).rpc("get_partner_finance_overview", { p_company_id: companyId });
    if (error || !isRecord(data) || !Array.isArray(data.balances)) throw new FinanceRepositoryError();
    return {
      balances: (data.balances as Row[]).map(mapRow),
      obligations: Array.isArray(data.obligations) ? (data.obligations as ObligationRow[]).map(mapObligationRow) : [],
      unavailableCount: Number(data.unavailable_count ?? 0),
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
    if (!input.afterCompanyId) {
      const { data, error } = await client.rpc("list_partner_finance_sync_companies", {
        p_limit: input.limit,
      });
      if (error) throw new FinanceRepositoryError();
      return ((data ?? []) as FinanceSyncCompanyRow[]).map((company) => ({
        companyId: company.company_id,
        companyName: company.company_name,
        counterpartyRef: company.counterparty_ref,
        activeBalanceCount: Number(company.active_balance_count),
      }));
    }

    let query = client.from("partner_companies").select("id,display_name,external_1c_id").eq("status", "active").order("id").limit(input.limit);
    query = query.gt("id", input.afterCompanyId);
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

  async publishFinanceSnapshot(input: PublishFinanceSnapshotInput): Promise<{ balances: number; obligations: number; exclusions: number }> {
    const { data, error } = await createAdminClient().rpc("publish_partner_finance_snapshot_v3", {
      p_company_id: input.companyId,
      p_counterparty_ref: input.counterpartyRef,
      p_synchronized_at: input.synchronizedAt,
      p_balance_rows: toPublishRows(input),
      p_obligation_rows: input.obligations.map(toObligationRow),
      p_exclusion_rows: input.exclusions.map((row) => ({
        one_c_order_id: row.oneCOrderId,
        order_number: row.orderNumber,
        source_order_data_version: row.sourceOrderDataVersion,
        schedule_line_count: row.scheduleLineCount,
        reason: row.reason,
        source_observed_at: row.sourceObservedAt,
      })),
      p_balance_received_count: input.balanceDiagnostics.rawBalanceCount,
      p_excluded_deleted_count: input.balanceDiagnostics.deletedContractCount,
      p_duration_ms: input.durationMs,
      p_source_call_count: input.balanceDiagnostics.oneCCallCount + input.obligationDiagnostics.oneCCallCount,
      p_orders_received: input.obligationDiagnostics.ordersReceived,
      p_trigger: input.trigger,
      p_actor_user_id: input.actorUserId,
    });
    if (error || !isRecord(data)) {
      console.error({
        event: "finance_snapshot_publish_failed",
        ...safePostgrestDiagnostic(error),
        balanceRows: input.rows.length,
        obligationRows: input.obligations.length,
        exclusionRows: input.exclusions.length,
      });
      throw new FinanceRepositoryError();
    }
    return {
      balances: Number(data.balances ?? 0),
      obligations: Number(data.obligations ?? 0),
      exclusions: Number(data.exclusions ?? 0),
    };
  }

  async getReminderDryRunInput(): Promise<FinanceReminderCandidate[]> {
    const { data, error } = await createAdminClient().rpc("get_finance_reminder_dry_run_input");
    if (error || !Array.isArray(data)) throw new FinanceRepositoryError();
    return data.flatMap((value): FinanceReminderCandidate[] => {
      if (!isRecord(value) || !isRecord(value.obligation)) return [];
      const obligation = value.obligation as unknown as ObligationRow & { reconciliation_fingerprint?: unknown };
      return [{
        obligation: { ...mapObligationRow(obligation), reconciliationFingerprint: String(obligation.reconciliation_fingerprint ?? "") },
        companyName: String(value.companyName ?? ""),
        financeDataFresh: value.financeDataFresh === true,
        recipientUserId: typeof value.recipientUserId === "string" ? value.recipientUserId : null,
        recipientEmail: typeof value.recipientEmail === "string" ? value.recipientEmail : null,
        recipientRole: value.recipientRole === "partner_accounting" || value.recipientRole === "partner_owner" ? value.recipientRole : null,
        locale: value.locale === "ro" ? "ro" : "ru",
      }];
    });
  }

  async publishReminderDryRun(input: {
    businessDate: string;
    durationMs: number;
    projections: import("../../types").FinanceReminderProjection[];
    suppressions: import("../../types").FinanceReminderSuppression[];
  }): Promise<FinanceReminderDryRun> {
    const { data, error } = await createAdminClient().rpc("publish_finance_reminder_dry_run", {
      p_business_date: input.businessDate,
      p_duration_ms: input.durationMs,
      p_projections: input.projections.map((row) => ({
        company_id: row.companyId, channel: row.channel, recipient_user_id: row.recipientUserId,
        recipient_email: row.recipientEmail, locale: row.locale, milestone: row.milestone,
        obligation_ids: row.obligationIds, totals_by_currency: row.totalsByCurrency,
        subject: row.subject, body: row.body, fingerprint: row.fingerprint,
      })),
      p_suppressions: input.suppressions.map((row) => ({
        company_id: row.companyId, obligation_id: row.obligationId, reason: row.reason,
      })),
    });
    if (error || !isRecord(data)) throw new FinanceRepositoryError();
    return {
      id: String(data.id), businessDate: String(data.business_date), policyVersion: "FINANCE_REMINDER_V1",
      outboundMode: "DRY_RUN", eligibleCompanyCount: Number(data.eligible_company_count ?? 0),
      obligationCount: Number(data.obligation_count ?? 0), projectedEmailCount: Number(data.projected_email_count ?? 0),
      projectedInAppCount: Number(data.projected_in_app_count ?? 0), futureSmsEligibleCount: Number(data.future_sms_eligible_count ?? 0),
      suppressedCount: Number(data.suppressed_count ?? 0), duplicateCount: Number(data.duplicate_count ?? 0),
      durationMs: Number(data.duration_ms ?? 0),
    };
  }

  async getAdminFinanceOperations(): Promise<AdminFinanceOperations> {
    const { data, error } = await (await createClient()).rpc("get_admin_finance_operations");
    if (error || !isRecord(data)) throw new FinanceRepositoryError();
    return data as unknown as AdminFinanceOperations;
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

function toObligationRow(row: PublishFinanceSnapshotInput["obligations"][number]) {
  return {
    one_c_order_id: row.oneCOrderId, order_number: row.orderNumber, order_date: row.orderDate,
    one_c_counterparty_id: row.oneCCounterpartyId, one_c_contract_id: row.oneCContractId,
    one_c_organization_id: row.oneCOrganizationId, schedule_line_number: row.scheduleLineNumber,
    source_order_data_version: row.sourceOrderDataVersion, payment_percent: row.paymentPercent,
    planned_amount: row.plannedAmount, vat_amount: row.vatAmount, currency: row.currency,
    due_date: row.dueDate, payment_method: row.paymentMethod, bank_account_id: row.bankAccountId,
    bank_account_name: row.bankAccountName, paid_amount: row.paidAmount, remaining_amount: row.remainingAmount,
    payment_status: row.paymentStatus, settlement_last_payment_at: row.settlementLastPaymentAt,
    order_posted: row.orderPosted, order_deletion_mark: row.orderDeletionMark, order_status: row.orderStatus,
    reconciliation_status: row.reconciliationStatus, unsupported_reason: row.unsupportedReason,
    source_modified_at: row.sourceModifiedAt, source_observed_at: row.sourceObservedAt, synced_at: row.syncedAt,
  };
}

function mapObligationRow(row: ObligationRow): PartnerPaymentObligation {
  return {
    id: row.id, companyId: row.company_id, oneCOrderId: row.one_c_order_id, orderNumber: row.order_number,
    orderDate: row.order_date, oneCCounterpartyId: row.one_c_counterparty_id, oneCContractId: row.one_c_contract_id,
    oneCOrganizationId: row.one_c_organization_id, scheduleLineNumber: row.schedule_line_number,
    sourceOrderDataVersion: row.source_order_data_version, paymentPercent: String(row.payment_percent),
    plannedAmount: String(row.planned_amount), vatAmount: String(row.vat_amount), currency: row.currency,
    dueDate: row.due_date, paymentMethod: row.payment_method, bankAccountId: row.bank_account_id,
    bankAccountName: row.bank_account_name, paidAmount: String(row.paid_amount), remainingAmount: String(row.remaining_amount),
    paymentStatus: row.payment_status, settlementLastPaymentAt: row.settlement_last_payment_at,
    orderPosted: row.order_posted, orderDeletionMark: row.order_deletion_mark, orderStatus: row.order_status,
    reconciliationStatus: row.reconciliation_status, unsupportedReason: row.unsupported_reason,
    sourceModifiedAt: row.source_modified_at, sourceObservedAt: row.source_observed_at, syncedAt: row.synced_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safePostgrestDiagnostic(error: unknown): { databaseCode: string | null; constraint: string | null } {
  if (!isRecord(error)) return { databaseCode: null, constraint: null };
  const code = typeof error.code === "string" && /^[A-Z0-9_]{1,20}$/i.test(error.code)
    ? error.code
    : null;
  const message = typeof error.message === "string" ? error.message : "";
  const constraint = message.match(/constraint\s+"([a-z0-9_]{1,100})"/i)?.[1] ?? null;
  return { databaseCode: code, constraint };
}

function isSyncStateRow(value: unknown): value is SyncStateRow {
  return isRecord(value) && typeof value.company_id === "string" && typeof value.status === "string";
}
