import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260716120000_estimates_foundation.sql"), "utf8");

describe("estimate foundation migration", () => {
  it("creates the minimal portal-owned aggregate without CRM or order ownership", () => {
    for (const table of ["estimates", "estimate_sections", "estimate_items", "partner_services", "estimate_events"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).not.toMatch(/create table public\.(leads|deals|pipelines|customers)/i);
    expect(sql).not.toMatch(/insert into public\.(partner_orders|carts)/i);
  });

  it("enables RLS, denies anonymous writes, and exposes mutations only through guarded RPCs", () => {
    for (const table of ["estimates", "estimate_sections", "estimate_items", "partner_services", "estimate_events"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("revoke all on table public.estimates");
    expect(sql).not.toMatch(/grant (insert|update|delete).* to authenticated/i);
    expect(sql).toContain("public.can_access_estimates(target_company_id, 'estimates.manage')");
    expect(sql).toContain("public.can_access_estimates(target.company_id, 'estimates.pricing.manage')");
  });

  it("uses generated decimal line totals and server-refreshed estimate totals", () => {
    expect(sql).toMatch(/line_total numeric\(18, 2\) generated always as/i);
    expect(sql).toContain("round(selling_unit_price * quantity, 2)");
    expect(sql).toContain("create trigger refresh_estimate_totals_after_item_change");
  });

  it("provides non-reusable estimate numbering and optimistic concurrency", () => {
    expect(sql).toContain("create sequence if not exists public.estimate_number_sequence");
    expect(sql).toContain("'KP-' || to_char(current_date, 'YYYY')");
    expect(sql).toContain("target.revision <> expected_revision");
  });
});
