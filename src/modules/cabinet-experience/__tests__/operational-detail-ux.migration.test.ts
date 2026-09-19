import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260919095336_customer_agent_operational_detail_ux_v2.sql"), "utf8");

describe("operational detail read projections", () => {
  it("bounds list projections and uses existing indexed event relations", () => {
    expect(sql).toContain("limit least(greatest(p_limit, 1), 20)");
    expect(sql).toContain("limit least(greatest(p_limit, 1), 50)");
    expect(sql).toContain("e.referral_id = referral.id");
    expect(sql).toContain("e.attribution_id = attribution.id");
    expect(sql).not.toMatch(/create index/i);
  });

  it("keeps Agent reads auth-owned and service summaries private", () => {
    expect(sql).toContain("agent.user_id = auth.uid()");
    expect(sql).toContain("join agent on agent.id = referral.agent_id");
    expect(sql).toContain("join agent on agent.id = attribution.agent_id");
    expect(sql).toContain("visibility = 'CUSTOMER_VISIBLE'");
    expect(sql).toContain("grant execute on function public.list_customer_service_requests_summary_v1(uuid, integer, integer) to service_role");
    expect(sql).not.toContain("to anon");
  });
});
