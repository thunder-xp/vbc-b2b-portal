import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730141000_product_stock_arrival_transition_capture.sql",
  ),
  "utf8",
);

describe("watched-product stock and arrival transition capture", () => {
  it("wraps the existing atomic publisher without replacing its business logic", () => {
    expect(sql).toContain(
      "publish_exact_stock_snapshot_product_notification_base(p_sync_id)",
    );
    expect(sql).toContain("base_result :=");
  });

  it("captures only products with active list or cart watchers", () => {
    expect(sql).toContain("from public.purchasing_list_items item");
    expect(sql).toContain("from public.cart_items item");
    expect(sql).toContain("membership.status = 'active'");
    expect(sql).toContain("list.archived_at is null");
    expect(sql).toContain("cart.status = 'active'");
  });

  it("ignores quantity-only changes by comparing partner-visible states", () => {
    expect(sql).toContain("previous_state <> current_state.new_state");
    expect(sql).toContain("stock.available_quantity > 0 then 'in_stock'");
    expect(sql).not.toContain("previous_quantity");
  });

  it("does not roll back publication when capture fails", () => {
    expect(sql).toContain("exception when others then");
    expect(sql).toContain("'transition_capture_failed'");
    expect(sql.indexOf("base_result :=")).toBeLessThan(
      sql.lastIndexOf("exception when others then"),
    );
  });

  it("creates no live provider or polling dependency", () => {
    expect(sql).not.toMatch(/standardodata|http_|fetch\s*\(|cron/i);
  });
});
