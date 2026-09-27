import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260927155023_automatic_1c_commercial_rates.sql"), "utf8");

describe("automatic 1C commercial-rate migration", () => {
  it("publishes exact 113 and 999 purposes atomically and no-ops unchanged versions", () => {
    expect(sql).toContain("create or replace function public.publish_automatic_commercial_rates");
    expect(sql).toContain("jsonb_array_length(p_rates) <> 2");
    expect(sql).toContain("purpose = 'partner_price_usd_to_mdl' and code = '113'");
    expect(sql).toContain("purpose = 'retail_price_usd_to_mdl' and code = '999'");
    expect(sql).toContain("current_rate.source_data_version = candidate.data_version");
    expect(sql).toContain("'NO_OP'");
    expect(sql).toContain("jsonb_agg(to_jsonb(active_rate) order by active_rate.purpose)");
  });

  it("keeps immutable source evidence and a durable watchdog state", () => {
    expect(sql).toContain("prevent_automatic_commercial_rate_evidence_mutation");
    expect(sql).toContain("create table public.commercial_rate_sync_state");
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("interval '30 minutes'");
    expect(sql).toContain("last_source_checked_at");
  });

  it("corrects the retail freshness purpose and keeps privileged RPCs server-only", () => {
    expect(sql).toContain("'retail_price_usd_to_mdl'");
    expect(sql).not.toContain("retail_price_mdl_to_usd");
    expect(sql).toContain("grant execute on function public.publish_automatic_commercial_rates(jsonb, timestamptz, uuid) to service_role");
    expect(sql).toContain("revoke all on table public.commercial_rate_sync_state from public, anon, authenticated");
  });
});
