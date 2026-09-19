import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260919092207_customer_agent_cabinet_experience_foundation.sql"), "utf8").toLowerCase();

describe("Customer and Agent cabinet experience migration", () => {
  it("extends the existing self-scoped overview without adding a read fanout", () => {
    expect(sql).toContain("create or replace function public.get_agent_cabinet_overview()");
    expect(sql).toContain("private.current_commercial_agent()");
    expect(sql).toContain("latestactivity");
    expect(sql).toContain("limit 6");
    expect(sql).not.toContain("create table");
  });

  it("exposes operational events only and no financial projection", () => {
    expect(sql).toContain("referral_captured");
    expect(sql).toContain("attribution_created");
    expect(sql).not.toMatch(/agent_commission|commission_amount|payout|balance/);
  });
});
