import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260825085319_suggest_primary_cash_contract_mapping.sql"),
  "utf8",
);

describe("primary cash contract suggestion migration", () => {
  it("suggests only the exact qualified primary contract", () => {
    expect(sql).toContain("lower(candidate.external_1c_id) = lower(company.external_1c_contract_id)");
    expect(sql).toContain("candidate.cash_qualification->>'qualified'");
    expect(sql).toContain("'suggestedCashContractRef'");
  });

  it("does not replace an existing or removed governed mapping", () => {
    expect(sql).toContain("when cash_mapping.company_id is null then primary_cash_suggestion.contract_ref");
  });

  it("remains a read-only aggregate without automatic cash mapping", () => {
    expect(sql).not.toMatch(/insert\s+into\s+public\.partner_company_cash_contract_mappings/i);
    expect(sql).not.toMatch(/update\s+public\.partner_company_cash_contract_mappings/i);
  });

  it("preserves the existing permission and bounded candidate contract", () => {
    expect(sql).toContain("public.has_internal_permission('admin.companies.view')");
    expect(sql).toContain("limit 50");
    expect(sql).toContain("grant execute on function public.get_admin_partner_contract_mapping(uuid) to authenticated");
    expect(sql).not.toContain("partner_company_access_policies");
    expect(sql).not.toContain("company_memberships");
  });
});
