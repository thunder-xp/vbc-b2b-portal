import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260719210000_partner_contract_balances.sql"), "utf8");

describe("partner contract balance read model migration", () => {
  it("keeps partner writes denied and scopes reads by the existing finance permission", () => {
    expect(sql).toContain("alter table public.partner_contract_balances enable row level security");
    expect(sql).toContain("public.has_permission(company_id, 'finance.view_company')");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all).*authenticated/i);
  });

  it("publishes complete snapshots atomically through a service-role-only RPC", () => {
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("grant execute on function public.publish_partner_contract_balances");
    expect(sql).toContain("signed_balance <> 0");
  });
});
