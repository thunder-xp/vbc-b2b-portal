import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260921210000_agent_activation_status_cabinet_v1.sql"), "utf8");
const foundation = readFileSync(resolve("supabase/migrations/20260913114439_commercial_agent_domain_foundation.sql"), "utf8");

describe("Commercial Agent activation governance migration", () => {
  it("records idempotent contract confirmation with actor and audit event", () => {
    expect(sql).toContain("contract_confirmed_at timestamptz");
    expect(sql).toContain("contract_confirmed_by uuid");
    expect(sql).toContain("create or replace function public.confirm_commercial_agent_contract");
    expect(sql).toContain("if target.contract_ready then");
    expect(sql).toContain("'AGENT_CONTRACT_CONFIRMED'");
  });

  it("fails lifecycle and token operations closed before prerequisites are met", () => {
    expect(sql).toContain("p_target_status in ('APPROVED', 'ACTIVE')");
    expect(sql).toContain("previous.compliance_status <> 'APPROVED' or not previous.contract_ready");
    expect(sql).toContain("if target_status <> 'ACTIVE' then");
  });

  it("preserves the public referral capture requirement for an ACTIVE Agent", () => {
    expect(foundation).toContain("and agent.status = 'ACTIVE'");
  });

  it("exposes every privileged mutation only to service_role", () => {
    for (const signature of [
      "public.confirm_commercial_agent_contract(uuid, uuid)",
      "public.transition_commercial_agent_record(uuid, text, uuid)",
      "public.create_agent_referral_token_record(uuid, text, text, text, timestamptz, uuid)",
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated, service_role`);
      expect(sql).toContain(`grant execute on function ${signature} to service_role`);
    }
  });
});
