import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260824091419_correct_contract_mapping_currency_semantics.sql"), "utf8");

describe("contract candidate currency semantics", () => {
  it("validates price-type currency independently of settlement currency", () => {
    expect(sql).toContain("source_price_type.currency_external_1c_id");
    expect(sql).toContain("local_price_type.currency_ref");
    expect(sql).toContain("CONTRACT_PRICE_TYPE_CURRENCY_MISMATCH");
    expect(sql).not.toMatch(/contract\.contract_currency_external_1c_id\)\s*<>\s*lower\([^)]*local_price_type\.currency_ref/i);
  });

  it("keeps every structural qualification at the mutation boundary", () => {
    for (const code of [
      "CONTRACT_NOT_OWNED_BY_COMPANY", "CONTRACT_INACTIVE", "CONTRACT_INVALID_TYPE",
      "CONTRACT_ORGANIZATION_MISMATCH", "CONTRACT_PRICE_TYPE_MISSING", "CONTRACT_PRICE_TYPE_INVALID",
    ]) expect(sql).toContain(code);
    expect(sql).toContain("qualification := public.qualify_partner_contract_candidate");
  });

  it("collapses historical rows and suggests only one valid default", () => {
    expect(sql).toContain("partition by lower(contract.external_1c_id)");
    expect(sql).toContain("contract.history_rank = 1");
    expect(sql).toContain("valid_defaults.default_count = 1");
    expect(sql).toContain("'defaultContractAmbiguous', valid_defaults.default_count > 1");
  });

  it("does not change access or membership state", () => {
    expect(sql).not.toContain("company_memberships");
    expect(sql).not.toContain("partner_company_access_policies");
  });
});
