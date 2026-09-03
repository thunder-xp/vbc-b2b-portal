import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903140756_repair_directory_commercial_reconciliation.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");

describe("directory commercial reconciliation migration", () => {
  it("runs from each successful directory publication and supports bounded recovery", () => {
    expect(sql).toContain("new.status = 'succeeded'");
    expect(sql).toContain("new.sync_id");
    expect(sql).toContain("cardinality(p_company_ids) not between 1 and 100");
    expect(sql).toContain("company.id = any(p_company_ids)");
  });

  it("selects only one active Novotech default customer contract", () => {
    expect(sql).toContain("contract.is_default");
    expect(sql).toContain("contract.is_active");
    expect(sql).toContain("not contract.is_deleted");
    expect(sql).toContain("default_count = 1");
    expect(sql).toContain("4643d461-aa49-4b70-9486-a59f80ee6af8");
    expect(sql).toContain("d181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc");
  });

  it("aligns contract and governed price type in one company update", () => {
    expect(sql).toMatch(
      /update public\.partner_companies company[\s\S]*external_1c_contract_id = change\.next_contract_ref,[\s\S]*external_1c_price_type_id = change\.next_price_type_ref/,
    );
    expect(sql).toContain("commercial_profile_state = change.next_profile_state");
    expect(sql).toContain("commercial_profile_version = company.commercial_profile_version + 1");
    expect(sql).toContain("contract_mapping_version = company.contract_mapping_version");
  });

  it("never treats a stale non-default contract as aligned", () => {
    expect(sql).toContain("when default_count = 0 then 'contract_missing'");
    expect(sql).toContain("when default_count <> 1 then 'mismatch'");
    expect(sql).toContain("when can_align then default_contract_ref else previous_contract_ref");
    expect(sql).toContain("when can_align then default_price_type_ref else previous_price_type_ref");
  });

  it("keeps settlement and governed price currency as separate validated facts", () => {
    expect(sql).toContain("canonical.settlement_currency_ref");
    expect(sql).toContain("source_price_type.currency_external_1c_id");
    expect(sql).toContain("local_price_type.currency_ref");
    expect(sql).toContain("public.validate_commercial_currency_context(");
    expect(sql).not.toMatch(/settlement_currency_ref\s*=\s*(?:source_price_currency_ref|local_price_currency_ref)/);
  });

  it("does not impose a company id on globally governed product prices", () => {
    expect(sql).toContain("from public.product_prices price");
    expect(sql).toContain("lower(price.external_1c_price_type_id)");
    expect(sql).not.toMatch(/product_prices[\s\S]{0,300}company_id\s*=/i);
  });

  it("keeps the repair local, set based, append only, and least privileged", () => {
    expect(sql).toContain("with target_companies as materialized");
    expect(sql).not.toMatch(/\bloop\b/i);
    expect(sql).not.toContain("http_");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("set row_security = off");
    expect(sql).toMatch(
      /revoke all on function public\.reconcile_partner_company_commercial_profiles_from_directory\([\s\S]*from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.reconcile_partner_company_commercial_profiles_from_directory\([\s\S]*to service_role/,
    );
    expect(sql).toContain("prevent_partner_company_directory_reconciliation_event_mutation");
  });
});
