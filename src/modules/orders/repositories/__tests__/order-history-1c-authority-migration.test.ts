import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260909114000_order_history_1c_authority_portal_fallback.sql"),
  "utf8",
);

describe("confirmed portal-order 1C authority migration", () => {
  it("retains portal audit rows and stores a governed authority state", () => {
    expect(sql).toContain("authoritative_presence");
    expect(sql).toContain("confirmed_missing_from_1c");
    expect(sql).not.toMatch(/delete\s+from\s+public\.partner_orders/i);
    expect(sql).toContain("partner_order_authority_events");
    expect(sql).toContain("append-only");
  });

  it("selects one bounded company-scoped batch across history and unmatched portal orders", () => {
    expect(sql).toContain("get_partner_order_authority_candidates");
    expect(sql).toContain("portal.company_id = p_company_id");
    expect(sql).toContain("history.company_id = p_company_id");
    expect(sql).toContain("greatest(1, least(p_limit, 25))");
    expect(sql).toContain("lower(history.external_1c_order_ref) = lower(portal.external_1c_ref)");
  });

  it("maps exact results without changing visibility on unknown", () => {
    expect(sql).toMatch(/when existing\.result = 'exists' then 'confirmed_present_in_1c'/);
    expect(sql).toMatch(/when existing\.result in \('deletion_marked', 'absent'\) then 'confirmed_missing_from_1c'/);
    expect(sql).toContain("else portal.authoritative_presence");
    expect(sql).toContain("source->>'status' not in ('exists', 'deletion_marked', 'absent', 'unknown')");
  });

  it("keeps all authority functions private to the service role", () => {
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("auth.role()) <> 'service_role'");
  });
});
