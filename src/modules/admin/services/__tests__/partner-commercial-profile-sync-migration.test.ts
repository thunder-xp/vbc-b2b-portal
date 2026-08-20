import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve("supabase/migrations/20260820082555_partner_company_commercial_profile_sync.sql"),
  "utf8",
);

describe("partner commercial profile synchronization migration", () => {
  it("keeps the mapped contract as the only source of the published price type", () => {
    expect(sql).toContain("company.external_1c_contract_id");
    expect(sql).toContain("contract.price_type_external_1c_id");
    expect(sql).toContain("external_1c_price_type_id = next_ref");
    expect(sql).not.toMatch(/p_(?:price_type|commercial_status)/i);
  });

  it("uses one company-scoped lease and idempotent correlation identity", () => {
    expect(sql).toContain("partner_company_commercial_profile_sync_running_idx");
    expect(sql).toContain("where status = 'running'");
    expect(sql).toContain("correlation_id uuid not null unique");
    expect(sql).toContain("lease_expires_at");
  });

  it("fails closed before publication when price coverage or currency is unsafe", () => {
    expect(sql).toContain("COMMERCIAL_PRICE_DATA_STALE");
    expect(sql).toContain("COMMERCIAL_CURRENCY_MISMATCH");
    expect(sql).toContain("price_count = 0");
    expect(sql).toContain("price_synced_at < now() - interval '36 hours'");
  });

  it("preserves access policy independence and appends immutable audit", () => {
    expect(sql).not.toContain("partner_company_access_policies");
    expect(sql).not.toContain("company_memberships");
    expect(sql).toContain("prevent_partner_company_commercial_profile_event_mutation");
    expect(sql).toContain("before update or delete");
  });

  it("detects scheduled mismatches without automatically changing the profile", () => {
    const reconciliation = sql.slice(
      sql.indexOf("create or replace function public.reconcile_partner_company_commercial_profiles"),
      sql.indexOf("revoke all on function public.reconcile_partner_company_commercial_profiles"),
    );
    expect(sql).toContain("reconcile_commercial_profiles_after_directory_sync");
    expect(sql).toContain("commercial_profile_state = facts.next_state");
    expect(reconciliation).not.toMatch(/set[\s\S]*external_1c_price_type_id\s*=/i);
  });

  it("does not expose privileged mutation helpers", () => {
    expect(sql).toMatch(/revoke all on function public\.publish_partner_commercial_profile_sync\(uuid, jsonb\)[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.publish_partner_commercial_profile_sync\(uuid, jsonb\) to service_role/i);
    expect(sql).toMatch(/set search_path = public/g);
  });
});
