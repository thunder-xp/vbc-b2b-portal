import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { OrderHistoryFullAuditAdminItem, OrderHistoryFullAuditClaim } from "../../types";
import type { OrderHistoryIntegrityRepository } from "../order-history-integrity.repository";
import { OrderHistoryRepositoryError } from "../order-history.repository";

type Row = Record<string, unknown>;

export class SupabaseOrderHistoryIntegrityRepository implements OrderHistoryIntegrityRepository {
  async enqueue(companyId: string): Promise<string> {
    const { data, error } = await (await createClient()).rpc("enqueue_partner_order_history_full_audit", { p_company_id: companyId });
    if (error || typeof data !== "string") throw new OrderHistoryRepositoryError();
    return data;
  }

  async listAdmin(limit = 25): Promise<OrderHistoryFullAuditAdminItem[]> {
    const { data, error } = await createAdminClient().from("partner_order_history_full_audits")
      .select("id,company_id,status,current_pass,pass_one_count,pass_two_count,hidden_count,requested_at,finished_at,safe_error,partner_companies!inner(display_name)")
      .order("requested_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)));
    if (error) throw new OrderHistoryRepositoryError();
    return ((data ?? []) as Row[]).map((row) => {
      const company = record(row.partner_companies);
      return {
        id: text(row.id),
        companyId: text(row.company_id),
        companyName: text(company?.display_name),
        status: row.status as OrderHistoryFullAuditAdminItem["status"],
        currentPass: number(row.current_pass),
        passOneCount: nullableNumber(row.pass_one_count),
        passTwoCount: nullableNumber(row.pass_two_count),
        hiddenCount: number(row.hidden_count),
        requestedAt: text(row.requested_at),
        finishedAt: nullableText(row.finished_at),
        safeError: nullableText(row.safe_error),
      };
    });
  }

  async claim(): Promise<OrderHistoryFullAuditClaim | null> {
    const { data, error } = await createAdminClient().rpc("claim_partner_order_history_full_audit");
    if (error) throw new OrderHistoryRepositoryError();
    if (data === null || !record(data)) return null;
    const pass = number(data.current_pass);
    if ((pass !== 1 && pass !== 2) || !text(data.lease_token)) throw new OrderHistoryRepositoryError();
    return {
      id: text(data.id),
      companyId: text(data.company_id),
      counterpartyRef: text(data.counterparty_ref),
      currentPass: pass,
      nextSkip: number(data.next_skip),
      pageSize: number(data.page_size),
      leaseToken: text(data.lease_token),
    };
  }

  async stagePage(input: Parameters<OrderHistoryIntegrityRepository["stagePage"]>[0]) {
    const { data, error } = await createAdminClient().rpc("stage_partner_order_history_full_audit_page", {
      p_audit_id: input.claim.id,
      p_lease_token: input.claim.leaseToken,
      p_pass_number: input.claim.currentPass,
      p_page_number: input.pageNumber,
      p_page_fingerprint: input.pageFingerprint,
      p_rows: input.rows.map((row) => ({
        external_1c_order_ref: row.external1cOrderRef,
        source_version: row.sourceVersion,
        deletion_mark: row.deletionMark,
        document_date: row.documentDate,
      })),
      p_has_more: input.hasMore,
    });
    if (error || !record(data)) throw new OrderHistoryRepositoryError();
    const status = text(data.status);
    if (status !== "continue" && status !== "pass_complete" && status !== "integrity_failed") throw new OrderHistoryRepositoryError();
    return status;
  }

  async finishPass(auditId: string, passNumber: 1 | 2) {
    const { data, error } = await createAdminClient().rpc("finish_partner_order_history_full_audit_pass", {
      p_audit_id: auditId,
      p_pass_number: passNumber,
    });
    if (error || !record(data)) throw new OrderHistoryRepositoryError();
    return { status: text(data.status), hidden: number(data.hidden) };
  }

  async fail(claim: OrderHistoryFullAuditClaim, safeError: string, integrityFailure: boolean): Promise<void> {
    const { data, error } = await createAdminClient().rpc("fail_partner_order_history_full_audit", {
      p_audit_id: claim.id,
      p_lease_token: claim.leaseToken,
      p_safe_error: safeError.slice(0, 500),
      p_integrity_failure: integrityFailure,
    });
    if (error || data !== true) throw new OrderHistoryRepositoryError();
  }
}

function record(value: unknown): Row | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Row : null; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : number(value); }
