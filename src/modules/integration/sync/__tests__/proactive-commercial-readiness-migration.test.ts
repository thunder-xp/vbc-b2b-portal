import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260903210004_proactive_commercial_readiness.sql"),
  "utf8",
);

describe("proactive commercial readiness migration", () => {
  it("targets a material canonical default-contract change", () => {
    expect(migration).toContain("source.is_default");
    expect(migration).toMatch(/material_changes[\s\S]*old_contract\.facts[\s\S]*next_contract\.facts/i);
    expect(migration).toContain("commercial_candidate_company_ids = candidate_ids");
  });

  it("targets a contract price-type change", () => {
    expect(migration).toContain("lower(coalesce(source.price_type_external_1c_id, ''))");
    expect(migration).toMatch(/next_contracts[\s\S]*price_type_external_1c_id/i);
  });

  it("automatically repairs a stale company profile", () => {
    expect(migration).toContain("when readiness.canonical_repairable then readiness.canonical_contract_ref");
    expect(migration).toContain("when readiness.canonical_repairable then readiness.canonical_price_type_ref");
    expect(migration).toContain("REPAIRABLE_STALE_PROFILE");
  });

  it("does not write an already aligned profile unnecessarily", () => {
    expect(migration).toMatch(/where company\.id = change\.company_id[\s\S]*commercial_profile_state is distinct from change\.next_profile_state/i);
    expect(migration).toContain("company.commercial_profile_verified_at is null");
  });

  it("classifies a missing canonical contract as irreparable", () => {
    expect(migration).toContain("when raw_default_count = 0 then 'MISSING_CANONICAL_CONTRACT'");
    expect(migration).toContain("Create and publish one canonical default customer contract in 1C");
  });

  it("classifies an unknown governed price type", () => {
    expect(migration).toContain("then 'UNKNOWN_PRICE_TYPE'");
    expect(migration).toContain("canonical_local_currency_status is distinct from 'resolved'");
  });

  it("reconciles a never-verified but otherwise repairable profile", () => {
    expect(migration).toContain("then 'UNVERIFIED_PROFILE'");
    expect(migration).toContain("classified.classification in ('REPAIRABLE_STALE_PROFILE', 'UNVERIFIED_PROFILE')");
  });

  it("classifies payment-path absence explicitly", () => {
    expect(migration).toContain("then 'NO_PAYMENT_PATH'");
    expect(migration).toContain("PAYMENT_PATH_READY");
  });

  it("raises internal severity for a non-empty cart", () => {
    expect(migration).toContain("when classified.cart_item_count > 0 then 'high'");
    expect(migration).toContain("blockedWithNonEmptyCart");
  });

  it("never falls back to a random active contract", () => {
    expect(migration).toContain("qualified_default_count = 1");
    expect(migration).not.toMatch(/order by[^;]+limit 1[^;]+default_contract_ref/i);
  });

  it("guards the GLOBAL NETWORK old-contract regression", () => {
    expect(migration).toMatch(/external_1c_contract_id[\s\S]*<> lower\(default_contract_ref\)[\s\S]*REPAIRABLE_STALE_PROFILE/i);
    expect(migration).toContain("contract_mapping_version = company.contract_mapping_version");
  });

  it("keeps company scope explicit", () => {
    expect(migration).toContain("company.id = any(p_company_ids)");
    expect(migration).toContain("lower(contract.counterparty_external_1c_id)");
  });

  it("allows only internal diagnostics and service-role workers", () => {
    expect(migration).toContain("public.has_internal_permission('admin.companies.view')");
    expect(migration).toMatch(/revoke all on function public\.get_partner_commercial_readiness[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/revoke all on function public\.run_partner_commercial_readiness_safety_net[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.get_admin_partner_commercial_readiness\(uuid\)[\s\S]*to authenticated/i);
  });

  it("uses set-based bounded candidate selection without company loops", () => {
    expect(migration).toContain("p_limit not between 1 and 100");
    expect(migration).toContain("from public.get_partner_commercial_readiness(null, true)");
    expect(migration).toContain("limit p_limit");
    expect(migration).not.toMatch(/for\s+[^\n]+in\s+select\s+company/i);
  });
});
