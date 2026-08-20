import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260820191441_current_warehouse_replenishment_storefront.sql"), "utf8");

describe("current warehouse replenishment migration", () => {
  it("selects one latest qualifying completed source and skips orders without exact catalog mappings", () => {
    expect(sql).toContain("current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'");
    expect(sql).toContain("product.external_1c_id = item.external_product_ref");
    expect(sql).toContain("product.is_active and product.is_visible");
    expect(sql).toContain("order by state.source_document_date desc");
    expect(sql).toContain("limit 1");
  });

  it("keeps procurement fields private and exposes only product identity plus stable order", () => {
    const partnerRpc = sql.slice(sql.indexOf("create function public.get_partner_current_warehouse_replenishment"), sql.indexOf("revoke all on function public.get_partner_current_warehouse_replenishment"));
    expect(partnerRpc).toContain("'productId', item.product_id");
    expect(partnerRpc).toContain("'sourceLineNumber', item.source_line_number");
    expect(partnerRpc).not.toContain("source_order_number");
    expect(partnerRpc).not.toContain("ordered_quantity");
    expect(partnerRpc).not.toContain("organization_ref");
  });

  it("replaces the singleton only after a qualifying detected transition", () => {
    expect(sql).toContain("arrival.source_sync_id = p_sync_id");
    expect(sql).toContain("arrival.mapped_product_count > 0");
    expect(sql).toContain("on conflict (singleton_key) do update");
    expect(sql).toContain("delete from public.current_warehouse_replenishment_items");
  });

  it("uses canonical public publication truth and limits every showcase block to five", () => {
    expect(sql).toContain("publication.status = 'published'");
    expect(sql).toContain("create function public.get_public_retail_showcase_v2");
    expect(sql).toContain("'replenishment', 5, 0");
    expect(sql).toContain("p_mode is distinct from 'replenishment'");
  });

  it("keeps source tables and current projection inaccessible directly", () => {
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on table");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("keeps only the current replenishment notification partner-visible", () => {
    expect(sql).toContain("notification.entity_id = selected_arrival.id");
    expect(sql).toContain("notification.entity_id is distinct from selected_arrival.id");
    expect(sql).toContain("archived_at = coalesce(notification.archived_at, now())");
  });
});
