import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260810221000_partner_finance_sync_fairness.sql"),
  "utf8",
);

describe("finance sync fairness migration", () => {
  it("prioritizes companies that have never or least recently been attempted", () => {
    expect(sql).toContain("left join public.partner_finance_sync_state state");
    expect(sql).toContain("order by state.last_attempt_at asc nulls first, company.id");
    expect(sql).toContain("limit p_limit");
  });

  it("keeps selection bounded and server-only", () => {
    expect(sql).toContain("p_limit < 1 or p_limit > 10");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
  });

  it("counts existing balances inside one bounded database operation", () => {
    expect(sql).toContain("left join lateral");
    expect(sql).toContain("balance.company_id = candidate.id");
    expect(sql).toContain("balance.is_active = true");
  });
});
