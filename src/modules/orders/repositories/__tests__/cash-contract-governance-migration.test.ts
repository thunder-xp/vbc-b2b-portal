import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260822090000_cash_contract_governance.sql"),
  "utf8",
);

describe("cash contract governance migration", () => {
  it("creates one explicit cash role without label inference", () => {
    expect(sql).toContain("contract_role text not null default 'cash'");
    expect(sql).toContain("check (contract_role = 'cash')");
    expect(sql).not.toMatch(/description\s*=\s*['\"]С ПОКУПАТЕЛЕМ/i);
    expect(sql).not.toMatch(/name\s*=\s*['\"]С ПОКУПАТЕЛЕМ/i);
  });

  it("validates exact owner, lifecycle, organization, price type, and currency", () => {
    expect(sql).toContain("qualify_partner_cash_contract_candidate");
    expect(sql).toContain("counterparty_external_1c_id");
    expect(sql).toContain("not contract.is_active or contract.is_deleted");
    expect(sql).toContain("contract.organization_external_1c_id");
    expect(sql).toContain("contract.price_type_external_1c_id");
    expect(sql).toContain("contract.contract_currency_external_1c_id");
    expect(sql).toContain("price_type.currency_status <> 'resolved'");
  });

  it("supports governed removal and append-only audit", () => {
    expect(sql).toContain("alter column new_contract_ref drop not null");
    expect(sql).toContain("event_type in ('mapped', 'changed', 'removed')");
    expect(sql).toContain("qualification_snapshot");
    expect(sql).toContain("set active = false, version = next_version");
  });

  it("resolves the selected contract price type server-side without an Optovaya fallback", () => {
    expect(sql).toContain("begin_partner_order_submission_v4");
    expect(sql).toContain("resolved_price_type_ref := lower(btrim(coalesce(target_contract.price_type_external_1c_id, '')))");
    expect(sql).not.toContain("Оптовая");
    expect(sql).not.toContain("Оптовая цена");
  });

  it("keeps privileged helpers and projections off public callers", () => {
    expect(sql).toContain("revoke all on function public.qualify_partner_cash_contract_candidate(uuid, text)");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.get_partner_checkout_configuration(uuid) to service_role");
  });
});
