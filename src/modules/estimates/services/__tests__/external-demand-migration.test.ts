import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260809008000_external_nomenclature_demand.sql"), "utf8");

describe("external nomenclature demand migration", () => {
  it("evolves the existing idempotency ledger instead of creating a parallel request entity", () => {
    expect(sql).toContain("alter table public.estimate_external_item_requests");
    expect(sql).not.toMatch(/create table public\.external_(item_)?demand_requests/);
    expect(sql).toContain("status is null");
  });

  it("keeps requests explicit, idempotent, company-scoped, and independent of adding a line", () => {
    expect(sql).toContain("set_partner_external_item_request");
    expect(sql).toContain("if target_request.status in ('new', 'reviewing', 'solution_proposed', 'closed')");
    expect(sql).toContain("public.can_access_estimates(target_estimate.company_id, 'estimates.manage')");
    expect(sql).toContain("Company members read external demand state");
  });

  it("captures customer, project, lifecycle, quantity, and geography context server-side", () => {
    for (const field of ["final_customer_id", "final_customer_industry_code", "final_customer_locality", "project_name", "estimate_lifecycle_status", "requested_quantity", "requested_unit"]) expect(sql).toContain(field);
  });

  it("uses the bounded lifecycle and immutable event/response history", () => {
    expect(sql).toContain("'new', 'reviewing', 'solution_proposed', 'closed', 'cancelled'");
    expect(sql).toContain("prevent_external_demand_event_mutation");
    expect(sql).toContain("prevent_external_demand_response_mutation");
    expect(sql).toContain("expected_version");
    expect(sql).toContain("on delete set null");
  });

  it("supports only explicit governed responses and never writes to 1C", () => {
    expect(sql).toContain("'catalog_product', 'governed_alternative', 'sourcing_review', 'cannot_supply'");
    expect(sql).toContain("target_catalog_product_id");
    expect(sql).not.toMatch(/Document_|InformationRegister_|external_1c_id|ONEC_/);
  });

  it("excludes archived estimates from bounded aggregation and counts distinct business identities", () => {
    expect(sql).toContain("estimate.archived_at is null");
    expect(sql).toContain("count(distinct estimate.id)");
    expect(sql).toContain("count(distinct estimate.company_id)");
    expect(sql).toContain("count(distinct estimate.final_customer_id)");
    expect(sql).toContain("least(greatest(coalesce(result_limit, 25), 1), 50)");
  });

  it("curates duplicates explicitly while preserving historical estimate references", () => {
    expect(sql).toContain("canonical_item_id");
    expect(sql).toContain("curate_external_nomenclature_duplicate");
    expect(sql).not.toMatch(/update public\.estimate_items[\s\S]{0,300}external_nomenclature_id/);
    expect(sql).toContain("item.canonical_item_id is null");
  });

  it("keeps direct mutation unavailable and trigger helpers non-executable", () => {
    expect(sql).toContain("revoke all on table public.estimate_external_item_request_responses");
    expect(sql).toContain("revoke execute on function public.prevent_external_demand_history_mutation() from authenticated");
    expect(sql).toContain("admin.external_demand.manage");
  });
});
