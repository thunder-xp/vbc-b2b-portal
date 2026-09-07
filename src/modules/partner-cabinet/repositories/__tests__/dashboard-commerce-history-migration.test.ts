import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260907193638_partner_dashboard_commerce_cards_history_ux.sql"), "utf8");

describe("dashboard commerce history migration", () => {
  it("keeps repeat history bounded, company-scoped, and current-commercial in one RPC", () => {
    expect(sql).toContain("get_partner_previously_purchased_products_v2");
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
    expect(sql).toContain("history.company_id = p_company_id");
    expect(sql).toContain("p_limit not between 1 and 24");
    expect(sql).toContain("pricing.partner_price.view");
    expect(sql).toContain("pricing.retail_price.view");
    expect(sql).toContain("'totalCount'");
    expect(sql).toContain("'categories'");
    expect(sql).toContain("to authenticated");
  });

  it("mixes only governed merchandising and published future arrivals with login-stable rotation", () => {
    expect(sql).toContain("get_or_refresh_partner_dashboard_selections_v2");
    expect(sql).toContain("public.get_or_refresh_partner_dashboard_selections(");
    expect(sql).toContain("product_supplier_arrivals");
    expect(sql).toContain("arrival.is_published");
    expect(sql).toContain("arrival.expected_arrival_date >= current_date");
    expect(sql).toContain("md5(source.product_id::text || ':' || rotation::text)");
    expect(sql).toContain("'offerCandidateCount'");
    expect(sql).toContain("'previousCandidateCount'");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });
});
