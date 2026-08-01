import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260801191000_product_relation_opportunities.sql"), "utf8");
const card = fs.readFileSync(path.join(process.cwd(), "src/modules/commercial-opportunities/components/OpportunityCard.tsx"), "utf8");

describe("product relation opportunity", () => {
  it("is bounded to one source signal and authoritative published analogs", () => {
    expect(migration).toContain("source_product_low_stock_with_available_analog");
    expect(migration).toContain("relation.relation_type = 'analog'");
    expect(migration).toContain("target.is_active and target.is_visible");
    expect(migration).toContain("limit 25");
    expect(migration).toContain("priority < 55");
    expect(migration).not.toContain("relation.target_product_external_1c_id");
  });

  it("uses all governed relevance sources and no per-analog notification", () => {
    for (const source of ["partner_order_history_items", "purchasing_list_items", "purchase_template_items", "cart_items"]) {
      expect(migration).toContain(source);
    }
    expect(migration).toContain("group by relevant.user_id, source.id");
    expect(migration).not.toContain("partner_notification");
  });

  it("renders the governed Russian reason and action", () => {
    expect(card).toContain("Товар заканчивается. Доступен аналог.");
    expect(card).toContain("Посмотреть аналоги");
  });
});
