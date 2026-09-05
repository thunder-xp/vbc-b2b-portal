import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260905173723_partner_live_reorder_workspace.sql"),
  "utf8",
);

describe("partner Live Commerce previously-purchased projection", () => {
  it("uses the existing reliable completed-order contract and excludes invalid history", () => {
    expect(migration).toContain("history.partner_visible");
    expect(migration).toContain("history.one_c_posted");
    expect(migration).toContain("not history.one_c_deletion_mark");
    expect(migration).toContain("history.one_c_state_code = 'completed'");
    expect(migration).toContain("history.origin_type <> 'internal_1c'");
    expect(migration).toContain("history.one_c_document_date <= now()");
    expect(migration).toContain("item.product_id is not null");
  });

  it("derives company access server-side and exposes no public grant", () => {
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("public.has_active_company_membership(p_company_id)");
    expect(migration).toContain("public.has_permission(p_company_id, 'orders.view')");
    expect(migration).toContain("revoke all on function public.get_partner_previously_purchased_products_v1");
    expect(migration).toContain("grant execute on function public.get_partner_previously_purchased_products_v1");
    expect(migration).not.toMatch(/\) to (?:anon|public);/i);
  });

  it("uses one bounded current-commercial aggregate without historical price or live 1C", () => {
    expect(migration).toContain("p_limit not between 1 and 20");
    expect(migration).toContain("partner_price_type_ref");
    expect(migration).toContain("price.valid_from <= now()");
    expect(migration).toContain("public.product_stock_totals stock");
    expect(migration).not.toContain("unit_price");
    expect(migration).not.toContain("external_1c_order_ref");
  });

  it("keeps cadence evidence distinct and deterministic", () => {
    expect(migration).toContain("repeat_purchase_available");
    expect(migration).toContain("repeat_purchase_due desc");
    expect(migration).toContain("last_purchased_at desc");
    expect(migration).toContain("purchase_count desc");
  });
});
