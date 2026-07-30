import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730142000_product_price_transition_capture.sql",
  ),
  "utf8",
);

describe("watched-product price transition capture", () => {
  it("wraps the existing atomic price and history publisher", () => {
    expect(sql).toContain(
      "publish_product_prices_with_retail_history_notification_base(p_sync_id)",
    );
    expect(sql).toContain("base_result :=");
  });

  it("compares stable permitted-price fingerprints instead of timestamps", () => {
    expect(sql).toContain("coalesce(price.price_amount::text, '')");
    expect(sql).toContain("previous_fingerprint <> current_state.new_fingerprint");
    expect(sql).not.toContain("price.effective_at");
  });

  it("persists no raw amount in the transition outbox", () => {
    expect(sql).toContain("previous_value_fingerprint");
    expect(sql).toContain("new_value_fingerprint");
    expect(sql).not.toMatch(/insert into public\.partner_product_transition_events[\s\S]*price_amount/);
  });

  it("limits capture to active list and cart watchers", () => {
    expect(sql).toContain("list.archived_at is null");
    expect(sql).toContain("cart.status = 'active'");
    expect(sql).toContain("membership.status = 'active'");
  });

  it("keeps successful price publication after notification capture failure", () => {
    expect(sql).toContain("'price_transition_capture_failed'");
    expect(sql.indexOf("base_result :=")).toBeLessThan(
      sql.lastIndexOf("exception when others then"),
    );
  });
});
