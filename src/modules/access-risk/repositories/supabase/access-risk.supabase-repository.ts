import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { AccessRiskCompanyDetail, AccessRiskOverview } from "../../types";
import {
  AccessRiskRepositoryError,
  type AccessRiskRepository,
  type AccessRiskTelemetryWrite,
} from "../access-risk.repository";

export class SupabaseAccessRiskRepository implements AccessRiskRepository {
  async recordTelemetry(input: AccessRiskTelemetryWrite): Promise<void> {
    const { error } = await createAdminClient().rpc("record_partner_access_risk_batch", {
      p_batch_id: input.batchId,
      p_company_id: input.companyId,
      p_user_id: input.userId,
      p_session_buckets: input.sessionBuckets,
      p_device_buckets: input.deviceBuckets,
      p_network_buckets: input.networkBuckets,
      p_session_hash: input.sessionHash,
      p_device_hash: input.deviceHash,
      p_network_hash: input.networkHash,
      p_country_code: input.countryCode,
      p_region_code: input.regionCode,
      p_product_buckets: input.productBuckets,
      p_category_buckets: input.categoryBuckets,
      p_events: input.events,
    });
    if (error) throw new AccessRiskRepositoryError("record_partner_access_risk_batch", error.code ?? "DATABASE_ERROR");
  }

  async evaluate(companyLimit: number): Promise<Record<string, unknown>> {
    const { data, error } = await createAdminClient().rpc("evaluate_partner_access_risk", {
      p_company_limit: companyLimit,
    });
    if (error || !isRecord(data)) throw new AccessRiskRepositoryError("evaluate_partner_access_risk", error?.code ?? "INVALID_RESULT");
    return data;
  }

  async getOverview(input: {
    query?: string;
    riskState?: string;
    mode?: string;
    sort?: string;
    page: number;
    pageSize: number;
  }): Promise<AccessRiskOverview> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_admin_access_risk_overview", {
      p_query: input.query ?? null,
      p_risk_state: input.riskState || null,
      p_mode: input.mode || null,
      p_sort: input.sort ?? "risk_desc",
      p_page: input.page,
      p_page_size: input.pageSize,
    });
    if (error || !isRecord(data)) throw new AccessRiskRepositoryError("get_admin_access_risk_overview", error?.code ?? "INVALID_RESULT");
    return mapOverview(data);
  }

  async getCompany(companyId: string, before?: string, limit = 50): Promise<AccessRiskCompanyDetail> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_admin_access_risk_company", {
      p_company_id: companyId,
      p_before: before ?? null,
      p_limit: limit,
    });
    if (error || !isRecord(data)) throw new AccessRiskRepositoryError("get_admin_access_risk_company", error?.code ?? "INVALID_RESULT");
    return mapCompany(data);
  }

  async setMonitoring(input: Parameters<AccessRiskRepository["setMonitoring"]>[0]): Promise<void> {
    const client = await createClient();
    const { error } = await client.rpc("set_admin_access_risk_monitoring", {
      p_company_id: input.companyId,
      p_mode: input.mode,
      p_duration_days: input.durationDays,
      p_reason: input.reason ?? null,
    });
    if (error) throw new AccessRiskRepositoryError("set_admin_access_risk_monitoring", error.code ?? "DATABASE_ERROR");
  }
}

function mapOverview(raw: Record<string, unknown>): AccessRiskOverview {
  const kpis = record(raw.kpis);
  return {
    kpis: {
      high: integer(kpis.high), elevated: integer(kpis.elevated), learning: integer(kpis.learning),
      enhanced: integer(kpis.enhanced), total: integer(kpis.total),
    },
    items: array(raw.items).map((item) => {
      const row = record(item);
      return {
        id: string(row.id), displayName: string(row.display_name), riskState: riskState(row.risk_state),
        riskScore: integer(row.risk_score), affectedUserCount: integer(row.affected_user_count),
        activeUserCount: integer(row.active_user_count), reasonCodes: stringArray(row.reason_codes),
        lastActivityAt: nullableString(row.last_activity_at), evaluatedAt: nullableString(row.evaluated_at),
        mode: row.mode === "ENHANCED" ? "ENHANCED" : "NORMAL",
        enhancedUntil: nullableString(row.enhanced_until),
      };
    }),
    total: integer(raw.total), page: integer(raw.page, 1), pageSize: integer(raw.pageSize, 25),
    diagnostics: mapDiagnostics(raw.diagnostics),
  };
}

function mapCompany(raw: Record<string, unknown>): AccessRiskCompanyDetail {
  const company = record(raw.company);
  const snapshot = record(raw.snapshot);
  const monitoring = record(raw.monitoring);
  return {
    company: { id: string(company.id), name: string(company.name), status: string(company.status) },
    snapshot: {
      riskState: snapshot.risk_state ? riskState(snapshot.risk_state) : undefined,
      riskScore: snapshot.risk_score === undefined ? undefined : integer(snapshot.risk_score),
      affectedUserCount: snapshot.affected_user_count === undefined ? undefined : integer(snapshot.affected_user_count),
      activeUserCount: snapshot.active_user_count === undefined ? undefined : integer(snapshot.active_user_count),
      reasonCodes: snapshot.reason_codes === undefined ? undefined : stringArray(snapshot.reason_codes),
      evaluatedAt: nullableString(snapshot.evaluated_at) ?? undefined,
      lastActivityAt: nullableString(snapshot.last_activity_at),
    },
    monitoring: {
      mode: monitoring.mode === "ENHANCED" ? "ENHANCED" : "NORMAL",
      expiresAt: nullableString(monitoring.expiresAt), reason: nullableString(monitoring.reason),
    },
    users: array(raw.users).map((value) => {
      const row = record(value);
      return {
        id: string(row.id), name: nullableString(row.name), email: string(row.email),
        riskState: riskState(row.riskState), riskScore: integer(row.riskScore),
        reasonCodes: stringArray(row.reasonCodes), reasons: array(row.reasons).map((reason) => {
          const item = record(reason); return { code: string(item.code), observed: integer(item.observed), threshold: integer(item.threshold) };
        }),
        metrics: numberRecord(row.metrics), baselineDays: integer(row.baselineDays), evaluatedAt: string(row.evaluatedAt),
      };
    }),
    timeline: array(raw.timeline).map((value) => {
      const row = record(value);
      return {
        id: string(row.id), occurredAt: string(row.occurred_at), eventName: string(row.event_name),
        routeFamily: string(row.route_family), userId: string(row.user_id), sessionHash: string(row.session_hash),
        deviceHash: string(row.device_hash), networkHash: nullableString(row.network_hash),
        countryCode: nullableString(row.country_code), regionCode: nullableString(row.region_code),
        productId: nullableString(row.product_id), categoryId: nullableString(row.category_id),
      };
    }),
    monitoringEvents: array(raw.monitoringEvents).map((value) => {
      const row = record(value);
      return {
        id: string(row.id), eventType: eventType(row.event_type),
        previousMode: row.previous_mode === "ENHANCED" ? "ENHANCED" : "NORMAL",
        nextMode: row.next_mode === "ENHANCED" ? "ENHANCED" : "NORMAL",
        reason: nullableString(row.reason), enhancedUntil: nullableString(row.enhanced_until), occurredAt: string(row.occurred_at),
      };
    }),
    hasMoreTimeline: raw.hasMoreTimeline === true,
  };
}

function mapDiagnostics(value: unknown): AccessRiskOverview["diagnostics"] {
  if (!isRecord(value)) return null;
  return {
    completedAt: string(value.completed_at), status: value.status === "FAILED" ? "FAILED" : "COMPLETED",
    companiesEvaluated: integer(value.companies_evaluated), usersEvaluated: integer(value.users_evaluated),
    enhancedProfilesExpired: integer(value.enhanced_profiles_expired), enhancedEventsDeleted: integer(value.enhanced_events_deleted),
    durationMs: integer(value.duration_ms), isStale: value.is_stale !== false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableString(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function integer(value: unknown, fallback = 0): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback; }
function stringArray(value: unknown): string[] { return array(value).filter((item): item is string => typeof item === "string"); }
function numberRecord(value: unknown): Record<string, number> { return Object.fromEntries(Object.entries(record(value)).map(([key, item]) => [key, Number(item)]).filter((entry) => Number.isFinite(entry[1]))); }
function riskState(value: unknown): "LEARNING" | "LOW" | "ELEVATED" | "HIGH" { return value === "HIGH" || value === "ELEVATED" || value === "LOW" ? value : "LEARNING"; }
function eventType(value: unknown): "ENHANCED_ACTIVATED" | "ENHANCED_STOPPED" | "ENHANCED_EXPIRED" { return value === "ENHANCED_ACTIVATED" || value === "ENHANCED_STOPPED" ? value : "ENHANCED_EXPIRED"; }
