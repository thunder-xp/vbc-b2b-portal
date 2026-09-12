import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260912222922_partner_access_risk_radar_v1.sql", "utf8");
const indexes = readFileSync("supabase/migrations/20260912223114_partner_access_risk_fk_indexes.sql", "utf8");

describe("Partner Access Risk Radar migration", () => {
  it("keeps NORMAL data aggregate-only and Enhanced detail bounded", () => {
    expect(sql).toContain("create table public.access_risk_hourly_aggregates");
    expect(sql).toContain("bit(256)");
    expect(sql).toContain("create table public.access_risk_enhanced_events");
    expect(sql).toContain("expires_at <= occurred_at + interval '30 days'");
    expect(sql).toContain("delete from public.access_risk_hourly_aggregates where hour_bucket < now() - interval '32 days'");
    expect(sql).not.toMatch(/\braw_ip\b|\bip_address\b|\basn\b/i);
  });

  it("reuses canonical behavior events instead of a second NORMAL raw stream", () => {
    expect(sql).toContain("from public.partner_behavior_events event");
    expect(sql).toContain("canonical_event_count = excluded.canonical_event_count");
    expect(sql).not.toContain("access_risk_normal_events");
  });

  it("enforces RLS, least privilege, and server-derived membership", () => {
    for (const table of ["access_risk_monitoring_profiles", "access_risk_monitoring_events", "access_risk_ingestion_receipts", "access_risk_hourly_aggregates", "access_risk_enhanced_events", "access_risk_user_snapshots", "access_risk_company_snapshots", "access_risk_evaluation_runs"]) {
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
    expect(sql).toContain("membership.company_id = p_company_id and membership.user_id = p_user_id");
    expect(sql).toContain("grant execute on function public.record_partner_access_risk_batch");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/grant execute on function public\.record_partner_access_risk_batch[^;]+to authenticated/);
  });

  it("uses deterministic explainable rules and prevents a new device alone from HIGH", () => {
    for (const code of ["NEW_DEVICE_SURGE", "CONCURRENT_SESSION_ANOMALY", "NETWORK_CHURN", "BROWSE_VOLUME_ANOMALY", "UNIQUE_SKU_SURGE", "CATEGORY_BREADTH_ANOMALY", "COMMERCIAL_DEAD_END", "HIGH_VELOCITY_BROWSING"]) expect(sql).toContain(code);
    expect(sql).toMatch(/score\s*>=\s*7 and has_concurrent and \(has_new_device or has_network_churn or has_velocity\)/);
    expect(sql).toMatch(/when score\s*>=\s*4 then 'ELEVATED'/);
    expect(sql).toMatch(/when active_days\s*<\s*7 then 'LEARNING'/);
  });

  it("auto-expires Enhanced mode and exposes only authorized Admin RPCs", () => {
    expect(sql).toContain("'ENHANCED_EXPIRED'");
    expect(sql).toContain("profile.mode = 'ENHANCED' and profile.expires_at <= now()");
    expect(sql).toContain("public.has_internal_permission('admin.security.view')");
    expect(sql).toContain("public.has_internal_permission('admin.security.manage')");
    expect(sql).toContain("p_duration_days not in (7, 14, 30)");
  });

  it("covers every non-primary foreign key used by retention and detail reads", () => {
    for (const column of ["activated_by", "actor_user_id", "company_id", "user_id", "product_id", "category_id"]) {
      expect(indexes).toContain(`(${column}`);
    }
  });
});
