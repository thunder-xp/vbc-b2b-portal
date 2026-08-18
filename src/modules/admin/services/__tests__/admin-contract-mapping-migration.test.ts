import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260818164828_admin_partner_contract_mapping.sql"),
  "utf8",
);

describe("admin partner contract mapping migration", () => {
  it("uses the synchronized local directory and one bounded candidate projection", () => {
    expect(migration).toContain("join public.one_c_counterparty_contracts contract");
    expect(migration).toContain("limit 50");
    expect(migration).toContain("one_c_counterparty_contracts_admin_mapping_idx");
    expect(migration).toContain("one_c_counterparty_contracts_published_ref_idx");
    expect(migration).not.toContain("http_get");
    expect(migration).not.toContain("net.http");
  });

  it.each([
    "CONTRACT_MAPPING_SUCCESS",
    "CONTRACT_NOT_FOUND",
    "CONTRACT_NOT_OWNED_BY_COMPANY",
    "CONTRACT_INACTIVE",
    "CONTRACT_INVALID_TYPE",
    "CONTRACT_ORGANIZATION_MISMATCH",
    "CONTRACT_PRICE_TYPE_MISMATCH",
    "CONTRACT_MAPPING_CONFLICT",
    "CONTRACT_MAPPING_FAILED",
  ])("preserves typed result %s", (code) => {
    expect(migration).toContain(`'${code}'`);
  });

  it("revalidates ownership, status, type, organization, price type, and optimistic version", () => {
    expect(migration).toContain("contract.counterparty_external_1c_id");
    expect(migration).toContain("not contract.is_active or contract.is_deleted");
    expect(migration).toContain("d181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc");
    expect(migration).toContain("contract.organization_external_1c_id");
    expect(migration).toContain("contract.price_type_external_1c_id");
    expect(migration).toContain("company.contract_mapping_version <> p_expected_version");
    expect(migration).toContain("for update");
  });

  it("updates one mapping and appends one immutable audit event atomically", () => {
    expect(migration).toContain("set external_1c_contract_id = normalized_contract_ref");
    expect(migration).toContain("insert into public.partner_company_contract_mapping_events");
    expect(migration).toContain("before update or delete on public.partner_company_contract_mapping_events");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("revoke all on function public.map_admin_partner_company_contract");
    expect(migration).toContain("admin.partner_integrity.manage");
  });
});
