import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260914163104_estimate_to_cart_unmet_demand.sql"), "utf8");
const cartService = readFileSync(join(process.cwd(), "src/modules/orders/services/cart.service.ts"), "utf8");
const workflow = readFileSync(join(process.cwd(), "src/modules/estimates/components/EstimateWorkflowPanel.tsx"), "utf8");

describe("Estimate-to-cart unmet demand migration", () => {
  it("allows every non-deleted lifecycle state while enforcing access at the database boundary", () => {
    expect(sql).toContain("target_estimate.deleted_at is not null");
    expect(sql).not.toMatch(/target_estimate\.lifecycle_status\s+(?:not\s+)?in/);
    expect(sql).not.toMatch(/target_estimate\.status\s*(?:=|<>|in)/i);
    expect(sql).toContain("public.can_access_estimates(target_estimate.company_id, 'estimates.convert_to_cart')");
    expect(sql).toContain("public.can_manage_partner_order_company(target_estimate.company_id)");
  });

  it("retains normalized source identity and applies only the governed quantity delta", () => {
    expect(sql).toContain("source_type text not null default 'estimate'");
    expect(sql).toContain("source_estimate_id uuid not null");
    expect(sql).toContain("source_estimate_line_id uuid not null");
    expect(sql).toContain("item.quantity + desired.delta_quantity");
    expect(sql).toContain("on conflict (cart_id, source_type, source_estimate_id, source_estimate_line_id)");
  });

  it("preserves zero versus unknown stock and never copies estimate price into cart truth", () => {
    expect(cartService).toContain('available === null');
    expect(cartService).toContain('"STOCK_UNKNOWN"');
    expect(cartService).toContain('available > 0');
    expect(cartService).toContain('"OUT_OF_STOCK"');
    expect(cartService).toContain("view?.partnerPrice?.amount ?? null");
    expect(sql).not.toMatch(/insert into public\.cart_items[\s\S]{0,250}(?:price|currency)/i);
  });

  it("deduplicates meaningful demand states and maintains a daily read model", () => {
    expect(sql).toContain("unmet_assortment_demand_event_state_unique");
    expect(sql).toContain("requested_quantity::text, input.available_quantity::text");
    expect(sql).toContain("on conflict (partner_company_id, estimate_id, estimate_line_id, state_fingerprint) do nothing");
    expect(sql).toContain("insert into public.unmet_assortment_demand_daily");
    expect(sql).toContain("window_days in (30, 90, 180)");
    for (const grouping of ["'sku'", "'product'", "'brand'", "'category'", "'partner'", "'manager'", "'time'"]) expect(sql).toContain(grouping);
    expect(sql).not.toMatch(/from public\.unmet_assortment_demand_events source[\s\S]+group by/);
  });

  it("reuses external nomenclature demand and emits aggregate lifecycle audit", () => {
    expect(sql).toContain("update public.estimate_external_item_requests");
    expect(sql).toContain("insert into public.estimate_external_item_request_events");
    expect(sql).toContain("'estimate_transferred_to_cart'");
    expect(sql).toContain("'unmet_assortment_demand_captured'");
  });

  it("exposes conversion only through the accepted Estimate guided state", () => {
    expect(workflow).toContain('guided.primaryAction === "continue_order"');
    expect(workflow).not.toContain('data-testid="estimate-transfer-to-cart"');
  });

  it("retains product identity when an Estimate-owned cart line leaves the active catalog", () => {
    const retainedSql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260914174658_retain_unavailable_estimate_cart_identity.sql"),
      "utf8",
    );
    expect(retainedSql).toContain("product_name_snapshot");
    expect(retainedSql).toContain("sku_snapshot");
    expect(retainedSql).toContain("slug_snapshot");
    expect(retainedSql).toContain("populate_cart_item_source_product_snapshot");
    expect(retainedSql).toContain("before insert or update on public.cart_item_sources");
  });
});
