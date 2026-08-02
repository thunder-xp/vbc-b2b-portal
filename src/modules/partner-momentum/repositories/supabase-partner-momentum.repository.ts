import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { AdminMomentumPage, MomentumCalculation, MomentumSource, PartnerMomentumSummary } from "../types";
import {
  PartnerMomentumRepositoryError,
  type PartnerMomentumProjectionRepository,
  type PartnerMomentumRepository,
} from "./partner-momentum.repository";

const orderSchema = z.object({
  id: z.string().uuid(),
  orderedAt: z.string().datetime({ offset: true }),
  total: z.coerce.number().nonnegative(),
  currency: z.string().nullable(),
  units: z.coerce.number().nonnegative(),
  productIds: z.array(z.string()),
});
const sourceSchema = z.object({
  companyId: z.string().uuid(),
  companyActive: z.boolean(),
  assignedManagerId: z.string().uuid().nullable(),
  sourceFingerprint: z.string().min(1),
  orders: z.array(orderSchema),
  intent: z.object({
    activeCart: z.boolean(),
    templateCount: z.coerce.number().int().nonnegative(),
    purchasingListCount: z.coerce.number().int().nonnegative(),
    opportunityCount: z.coerce.number().int().nonnegative(),
    campaignCount: z.coerce.number().int().nonnegative(),
  }),
  previous: z.object({
    status: z.enum(["growth", "stable", "slowing", "attention_required", "high_risk", "insufficient_history", "recovered"]),
    calculatedAt: z.string(),
    pendingStatus: z.enum(["growth", "stable", "slowing", "attention_required", "high_risk"]).nullable(),
    pendingCount: z.coerce.number().int().nonnegative(),
  }).nullable(),
  orderRowsScanned: z.coerce.number().int().nonnegative(),
  sourceTruncated: z.boolean(),
});

export class SupabasePartnerMomentumRepository implements PartnerMomentumRepository {
  async getPartnerSummary(companyId: string): Promise<PartnerMomentumSummary | null> {
    const { data, error } = await (await createClient()).rpc("get_partner_momentum_summary", { target_company_id: companyId });
    if (error) throw new PartnerMomentumRepositoryError();
    if (!isRecord(data)) return null;
    const status = text(data.status);
    if (status !== "slowing" && status !== "attention_required" && status !== "high_risk" && status !== "history_sync_pending" && status !== "history_sync_delayed") return null;
    return {
      status,
      title: text(data.title),
      explanation: text(data.explanation),
      calculatedAt: text(data.calculatedAt),
      sourceFingerprint: text(data.sourceFingerprint),
      actions: Array.isArray(data.actions) ? data.actions.flatMap((value) => isRecord(value)
        ? [{ key: text(value.key), label: text(value.label), href: text(value.href) }]
        : []) : [],
    };
  }

  async listAdmin(input: Parameters<PartnerMomentumRepository["listAdmin"]>[0]): Promise<AdminMomentumPage> {
    const { data, error } = await (await createClient()).rpc("list_partner_momentum_admin", {
      p_page: input.page,
      p_page_size: input.pageSize,
      p_status: input.status,
      p_manager: input.managerId,
      p_search: input.search,
    });
    if (error || !isRecord(data)) throw new PartnerMomentumRepositoryError();
    return {
      items: Array.isArray(data.items) ? data.items.map((item) => mapAdminRow(item)) : [],
      totalCount: number(data.totalCount),
    };
  }

  async getDiagnostics(): Promise<Record<string, unknown>> {
    const { data, error } = await (await createClient()).rpc("get_partner_momentum_diagnostics");
    if (error || !isRecord(data)) throw new PartnerMomentumRepositoryError();
    return data;
  }

  async recordAction(input: Parameters<PartnerMomentumRepository["recordAction"]>[0]): Promise<void> {
    const { error } = await (await createClient()).rpc("record_partner_momentum_action", {
      target_company_id: input.companyId,
      target_action_type: input.actionType,
      target_action_key: input.actionKey,
      target_source_fingerprint: input.sourceFingerprint,
    });
    if (error) throw new PartnerMomentumRepositoryError();
  }
}

export class SupabasePartnerMomentumProjectionRepository implements PartnerMomentumProjectionRepository {
  async enqueueAll(): Promise<number> {
    const { data, error } = await createAdminClient().rpc("enqueue_all_partner_momentum_companies");
    if (error) throw new PartnerMomentumRepositoryError();
    return number(data);
  }

  async claim(limit: number): Promise<string[]> {
    const { data, error } = await createAdminClient().rpc("claim_partner_momentum_companies", { target_limit: limit });
    if (error) throw new PartnerMomentumRepositoryError();
    return (data ?? []).flatMap((row: unknown) => isRecord(row) && typeof row.company_id === "string" ? [row.company_id] : []);
  }

  async loadSource(companyId: string): Promise<MomentumSource> {
    const { data, error } = await createAdminClient().rpc("get_partner_momentum_calculation_source", { target_company_id: companyId });
    const parsed = sourceSchema.safeParse(data);
    if (error || !parsed.success || parsed.data.sourceTruncated) throw new PartnerMomentumRepositoryError();
    return { ...parsed.data, now: new Date().toISOString() };
  }

  async publish(calculation: MomentumCalculation): Promise<{ snapshotId: string; transitionCreated: number }> {
    const { data, error } = await createAdminClient().rpc("publish_partner_momentum_snapshot", {
      target_payload: {
        ...calculation,
        reasonCodes: calculation.reasons.map((reason) => reason.code),
        reasons: calculation.reasons.map((reason, index) => ({ ...reason, rank: index + 1 })),
      },
    });
    if (error || !isRecord(data)) throw new PartnerMomentumRepositoryError();
    return { snapshotId: text(data.snapshotId), transitionCreated: number(data.transitionCreated) };
  }

  async fail(companyId: string, code: string): Promise<void> {
    const { error } = await createAdminClient().rpc("fail_partner_momentum_projection", {
      target_company_id: companyId,
      target_error_code: code,
    });
    if (error) throw new PartnerMomentumRepositoryError();
  }
}

function mapAdminRow(value: unknown): AdminMomentumPage["items"][number] {
  if (!isRecord(value)) throw new PartnerMomentumRepositoryError();
  return {
    companyId: text(value.companyId), companyName: text(value.companyName), fiscalCode: nullableText(value.fiscalCode),
    managerId: nullableText(value.managerId), managerName: nullableText(value.managerName), status: text(value.status) as AdminMomentumPage["items"][number]["status"],
    score: nullableNumber(value.score), lastOrderAt: nullableText(value.lastOrderAt), normalOrderIntervalDays: nullableNumber(value.normalOrderIntervalDays),
    cycleOverrunRatio: nullableNumber(value.cycleOverrunRatio), orderCountCurrent: number(value.orderCountCurrent), orderCountBaseline: number(value.orderCountBaseline),
    skuCountCurrent: number(value.skuCountCurrent), skuCountBaseline: number(value.skuCountBaseline),
    reasonCodes: Array.isArray(value.reasonCodes) ? value.reasonCodes.map(text) as AdminMomentumPage["items"][number]["reasonCodes"] : [], calculatedAt: text(value.calculatedAt),
  };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : number(value); }
