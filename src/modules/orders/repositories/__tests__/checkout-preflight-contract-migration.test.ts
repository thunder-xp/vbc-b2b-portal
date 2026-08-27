import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve("supabase/migrations/20260827081043_restore_checkout_preflight_contract.sql"),
  "utf8",
);

describe("checkout preflight qualifier contract migration", () => {
  it("restores the stable fields consumed by atomic order preflight", () => {
    expect(migration).toContain("create or replace function public.qualify_partner_contract_candidate");
    expect(migration).toContain("'organizationRef', contract.organization_external_1c_id");
    expect(migration).toContain("'priceTypeRef', contract.price_type_external_1c_id");
    expect(migration).toContain("'settlementCurrencyRef', contract.contract_currency_external_1c_id");
    expect(migration).toContain("'publishedPriceCurrencyRef', local_price_type.currency_ref");
  });

  it("preserves fail-closed qualification and restricted execution", () => {
    expect(migration).toContain("'qualified', result_code = 'CONTRACT_QUALIFIED'");
    expect(migration).toContain("CONTRACT_NOT_OWNED_BY_COMPANY");
    expect(migration).toContain("CONTRACT_ORGANIZATION_MISMATCH");
    expect(migration).toContain("CONTRACT_PRICE_TYPE_CURRENCY_MISMATCH");
    expect(migration).toMatch(
      /revoke all on function public\.qualify_partner_contract_candidate\(uuid, text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.qualify_partner_contract_candidate\(uuid, text\)[\s\S]*to service_role/i,
    );
  });

  it("does not special-case the incident company or contract", () => {
    expect(migration).not.toContain("b96072f0-ea2e-418b-828c-f4d72fba6a63");
    expect(migration).not.toContain("686b464a-d4b7-11ef-9989-7239d3b7bd5c");
  });
});
