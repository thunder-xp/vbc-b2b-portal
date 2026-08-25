import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260825100703_initialize_cash_contracts_from_qualified_primary.sql",
  ),
  "utf8",
);

describe("cash contract initialization migration", () => {
  it("initializes only the exact canonical-qualified primary contract", () => {
    expect(sql).toContain("company.external_1c_contract_id");
    expect(sql).toContain("public.qualify_partner_cash_contract_candidate(company.id, normalized_primary_ref)");
    expect(sql).toContain("qualification->>'code' <> 'CASH_CONTRACT_QUALIFIED'");
    expect(sql).toContain("contract_external_1c_id, contract_role, version, active");
    expect(sql).toContain("company.id, normalized_primary_ref, 'cash', 1, true");
  });

  it("preserves removed, existing, and ambiguous mapping intent", () => {
    expect(sql).toContain("CASH_INITIALIZATION_EXPLICITLY_REMOVED");
    expect(sql).toContain("CASH_INITIALIZATION_EXISTING_SAME_MAPPING");
    expect(sql).toContain("CASH_INITIALIZATION_EXISTING_DIFFERENT_MAPPING");
    expect(sql).toContain("CASH_INITIALIZATION_EXISTING_DIFFERENT_HISTORY");
    expect(sql).toContain("CASH_INITIALIZATION_AMBIGUOUS_HISTORY");
    expect(sql).toContain("select * into current_mapping");
    expect(sql).toContain("for update");
  });

  it("is idempotent and appends one governed initialization event", () => {
    expect(sql).toContain("on conflict (company_id) do nothing");
    expect(sql).toContain("CASH_INITIALIZATION_CONCURRENT_MAPPING");
    expect(sql).toContain("CASH_INITIALIZATION_IDEMPOTENT_REPLAY");
    expect(sql).toContain("'initialized_from_primary'");
    expect(sql).toContain("'batchCorrelationId', p_batch_correlation_id");
    expect(sql).toContain("'initializationSource', p_source");
  });

  it("runs a bounded failure-isolated batch without touching access or commercial truth", () => {
    expect(sql).toContain("p_limit not between 1 and 100");
    expect(sql).toContain("limit p_limit");
    expect(sql).toContain("exception when others then");
    expect(sql).toContain("CASH_INITIALIZATION_FAILED");
    expect(sql).not.toContain("company_memberships");
    expect(sql).not.toContain("partner_company_access_policies");
    expect(sql).not.toMatch(/update\s+public\.partner_companies/i);
    expect(sql).not.toContain("one_c_provider");
  });

  it("initializes after a verified commercial-profile transition without blocking it", () => {
    expect(sql).toContain("new.commercial_profile_state <> 'aligned'");
    expect(sql).toContain("new.commercial_profile_verified_at is null");
    expect(sql).toContain("run.status = 'running'");
    expect(sql).toContain("'commercial_profile_sync'");
    expect(sql).toContain("raise warning 'Cash contract initialization after commercial profile failed");
  });

  it("keeps every privileged helper off public authenticated surfaces", () => {
    expect(sql).toMatch(/revoke all on function public\.initialize_partner_cash_contract_from_primary[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.reconcile_partner_cash_contracts_from_primary[\s\S]*from public, anon, authenticated/i);
    expect(sql).toContain("grant execute on function public.initialize_partner_cash_contract_from_primary");
    expect(sql).toContain("grant execute on function public.reconcile_partner_cash_contracts_from_primary");
    expect(sql).toContain("to service_role");
    expect(sql).toMatch(/set search_path = public/g);
  });
});
