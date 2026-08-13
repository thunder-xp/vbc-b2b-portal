import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { getSafeDatabaseError } from "@/src/lib/observability/safe-database-error";
import { getWorkerCoordinationResult } from "@/src/lib/workers/coordination-result";

import type { AdminOrderHistoryBootstrapPage, OrderHistoryBootstrapClaim, OrderHistoryBootstrapState } from "../../types";
import { OrderHistoryBootstrapRepositoryError, type OrderHistoryBootstrapRepository } from "../order-history-bootstrap.repository";

const statusSchema = z.enum(["not_requested", "queued", "running", "succeeded", "failed_retryable", "failed_terminal", "stale"]);
const stateSchema = z.object({
  status: statusSchema,
  requestedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  lastErrorCode: z.string().nullable().optional(),
});
const claimSchema = z.object({
  id: z.string().uuid(), companyId: z.string().uuid(), counterpartyRef: z.string().min(1),
  lockToken: z.string().uuid(), historyFrom: z.string(), historyTo: z.string(),
});

export class SupabaseOrderHistoryBootstrapRepository implements OrderHistoryBootstrapRepository {
  async ensureFirstAccess(companyId: string, userId: string): Promise<OrderHistoryBootstrapState> {
    const client = await createClient();
    const { data, error } = await client.rpc("enqueue_partner_order_history_bootstrap", {
      p_company_id: companyId,
      p_requested_by_source: "first_access",
      p_requested_by_user_id: userId,
      p_force: false,
    });
    if (error) throw repositoryError("enqueue_partner_order_history_bootstrap", error);
    return parseState(data);
  }

  async getStatus(companyId: string): Promise<OrderHistoryBootstrapState> {
    const { data, error } = await (await createClient()).rpc("get_partner_order_history_bootstrap_status", { p_company_id: companyId });
    if (error) throw repositoryError("get_partner_order_history_bootstrap_status", error);
    return parseState(data);
  }

  async claim(): Promise<OrderHistoryBootstrapClaim | null> {
    const { data, error } = await createAdminClient().rpc("claim_partner_order_history_bootstrap", { p_stale_after_seconds: 1800 });
    if (error) throw repositoryError("claim_partner_order_history_bootstrap", error);
    if (data === null) return null;
    const parsed = claimSchema.safeParse(data);
    if (!parsed.success) throw repositoryError("parse_bootstrap_claim", parsed.error);
    return parsed.data;
  }

  async complete(claim: OrderHistoryBootstrapClaim, result: Record<string, unknown>) {
    const { data, error } = await createAdminClient().rpc("complete_partner_order_history_bootstrap_v2", {
      p_bootstrap_id: claim.id, p_lock_token: claim.lockToken, p_result: result,
    });
    if (error) throw repositoryError("complete_partner_order_history_bootstrap_v2", error);
    const conflict = getWorkerCoordinationResult(data);
    if (conflict) return conflict;
    if (!isRecord(data) || data.status !== "completed") throw repositoryError("parse_complete_partner_order_history_bootstrap_v2");
    return { status: "completed" as const };
  }

  async fail(claim: OrderHistoryBootstrapClaim, errorCode: string, retryable: boolean): Promise<void> {
    const { error } = await createAdminClient().rpc("fail_partner_order_history_bootstrap", {
      p_bootstrap_id: claim.id, p_lock_token: claim.lockToken,
      p_error_code: errorCode.slice(0, 80), p_retryable: retryable,
    });
    if (error) throw repositoryError("fail_partner_order_history_bootstrap", error);
  }

  async listAdmin(limit = 50): Promise<AdminOrderHistoryBootstrapPage> {
    const { data, error } = await (await createClient()).rpc("list_admin_order_history_bootstraps", { p_limit: Math.max(1, Math.min(limit, 100)) });
    if (error) throw repositoryError("list_admin_order_history_bootstraps", error);
    if (!isRecord(data) || !isRecord(data.summary) || !Array.isArray(data.items)) throw repositoryError("parse_admin_order_history_bootstraps");
    return {
      summary: {
        notRequested: number(data.summary.notRequested), queued: number(data.summary.queued),
        running: number(data.summary.running), succeeded: number(data.summary.succeeded),
        failed: number(data.summary.failed), stale: number(data.summary.stale),
        oldestPending: nullableText(data.summary.oldestPending),
      },
      items: data.items.flatMap((value) => mapAdminItem(value)),
    };
  }

  async enqueueAdmin(companyId: string): Promise<OrderHistoryBootstrapState> {
    const { data, error } = await (await createClient()).rpc("enqueue_partner_order_history_bootstrap", {
      p_company_id: companyId, p_requested_by_source: "admin_manual",
      p_requested_by_user_id: null, p_force: true,
    });
    if (error) throw repositoryError("enqueue_partner_order_history_bootstrap_admin", error);
    return parseState(data);
  }
}

function parseState(value: unknown): OrderHistoryBootstrapState {
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success) throw repositoryError("parse_bootstrap_state", parsed.error);
  return { status: parsed.data.status, requestedAt: parsed.data.requestedAt ?? null, completedAt: parsed.data.completedAt ?? null, lastErrorCode: parsed.data.lastErrorCode ?? null };
}
function mapAdminItem(value: unknown): AdminOrderHistoryBootstrapPage["items"] {
  if (!isRecord(value)) return [];
  const status = statusSchema.safeParse(value.status);
  if (!status.success || status.data === "not_requested") return [];
  return [{
    id: text(value.id), companyId: text(value.companyId), companyName: text(value.companyName), status: status.data,
    requestedAt: text(value.requestedAt), startedAt: nullableText(value.startedAt), completedAt: nullableText(value.completedAt),
    pagesProcessed: number(value.pagesProcessed), sourceRows: number(value.sourceRows), publishedRows: number(value.publishedRows),
    rejectedRows: number(value.rejectedRows), earliestOrderAt: nullableText(value.earliestOrderAt), latestOrderAt: nullableText(value.latestOrderAt),
    lastErrorCode: nullableText(value.lastErrorCode), lastFullSyncAt: nullableText(value.lastFullSyncAt), lastIncrementalSyncAt: nullableText(value.lastIncrementalSyncAt),
  }];
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function repositoryError(operation: string, cause?: unknown): OrderHistoryBootstrapRepositoryError {
  const safe = getSafeDatabaseError(cause);
  return new OrderHistoryBootstrapRepositoryError(
    operation,
    safe.code,
    safe.message,
    safe.details,
    safe.hint,
    safe.constraint,
    cause instanceof Error ? { cause } : undefined,
  );
}
