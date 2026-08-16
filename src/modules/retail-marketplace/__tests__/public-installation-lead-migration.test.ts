import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260816143602_public_installation_lead_intake.sql"), "utf8");
const grantHardeningSql = readFileSync(join(process.cwd(), "supabase/migrations/20260816151337_restrict_public_installation_lead_table_grants.sql"), "utf8");
const action = readFileSync(join(process.cwd(), "src/modules/public-retail/actions/installation-lead.actions.ts"), "utf8");

describe("public installation lead migration", () => {
  it("creates a constrained lightweight intake model", () => {
    expect(sql).toContain("create table public.public_installation_leads");
    expect(sql).toContain("object_type in ('apartment', 'house', 'office', 'retail', 'warehouse', 'production', 'other')");
    expect(sql).toContain("system_type in ('cctv', 'access_control', 'alarm', 'intercom', 'network', 'other')");
    expect(sql).toContain("phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'");
    expect(sql).not.toMatch(/email|deal|pipeline|opportunity|task/i);
  });

  it("keeps the table private and exposes only governed RPCs", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.public_installation_leads from public, anon, authenticated");
    expect(sql).toContain("grant select, insert on table public.public_installation_leads to service_role");
    expect(sql).not.toContain("grant all on table public.public_installation_leads to service_role");
    expect(grantHardeningSql).toContain("revoke all on table public.public_installation_leads from service_role");
    expect(grantHardeningSql).toContain("grant select, insert on table public.public_installation_leads to service_role");
    expect(sql).toContain("grant execute on function public.create_public_installation_lead");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("has_internal_permission('admin.retail_marketplace.view')");
  });

  it("provides O(1) replay, bounded duplicate and rate protection", () => {
    expect(sql).toContain("submission_key = p_submission_key");
    expect(sql).toContain("duplicate_fingerprint = p_duplicate_fingerprint");
    expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(3);
    expect(sql).toContain("hashtextextended(p_submission_key::text, 2)");
    expect(sql).toContain("'status', 'conflict'");
    expect(sql).toContain(">= 3");
    expect(sql).toContain("'rate_limited'");
    expect(sql).toContain("limit least(greatest(coalesce(p_limit, 50), 1), 100)");
  });

  it("indexes each bounded lookup by its leading predicate", () => {
    expect(sql).toContain("on public.public_installation_leads(created_at desc, id desc)");
    expect(sql).toContain("on public.public_installation_leads(requester_fingerprint, created_at desc)");
    expect(sql).toContain("on public.public_installation_leads(duplicate_fingerprint, created_at desc)");
    expect(sql).not.toContain("on public.public_installation_leads(status, created_at desc, id desc)");
  });

  it("does not let user-agent changes bypass requester rate limiting", () => {
    expect(action).not.toContain('requestHeaders.get("user-agent")');
    expect(action).toContain("}, requesterAddress, getSupabaseAdminEnv().serviceRoleKey)");
  });
});
