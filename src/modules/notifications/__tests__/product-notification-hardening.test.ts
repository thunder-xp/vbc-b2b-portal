import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectionSql = source(
  "supabase/migrations/20260730143000_product_notification_watcher_projection.sql",
);
const stockSql = source(
  "supabase/migrations/20260730141000_product_stock_arrival_transition_capture.sql",
);
const priceSql = source(
  "supabase/migrations/20260730142000_product_price_transition_capture.sql",
);
const link = source(
  "src/modules/notifications/components/ProductNotificationLink.tsx",
);

describe("watched-product notification hardening", () => {
  it("keeps publication authoritative when transition capture fails", () => {
    expect(stockSql).toContain("base_result :=");
    expect(stockSql).toContain("exception when others then");
    expect(priceSql).toContain("base_result :=");
    expect(priceSql).toContain("exception when others then");
  });

  it("does not scan products without a watcher", () => {
    expect(stockSql).toContain("exists (");
    expect(priceSql).toContain("exists (");
    expect(projectionSql).toContain(
      "item.product_id in (select product_id from product_transition_batch)",
    );
  });

  it("uses one bounded database-side watcher projection", () => {
    expect(projectionSql).toContain(
      "create temporary table product_notification_candidates",
    );
    expect(projectionSql).not.toMatch(/standardodata|http_|fetch\s*\(/i);
    expect(projectionSql).not.toMatch(/for\s+.*\s+in\s+select/i);
  });

  it("keeps raw commercial values out of notification payloads", () => {
    expect(projectionSql).not.toContain("raw_payload");
    expect(projectionSql).not.toMatch(
      /jsonb_build_object\([\s\S]{0,300}(price_amount|available_quantity)/,
    );
  });

  it("tracks product notification actions without blocking navigation", () => {
    expect(link).toContain('"product_notification_opened"');
    expect(link).toContain('"product_notification_product_opened"');
    expect(link).toContain('"product_notification_cart_opened"');
    expect(link).not.toContain("await recordBehaviorInteraction");
  });

  it("keeps interactive targets at least 44px high", () => {
    expect(source("app/(partner)/cabinet/notifications/page.tsx"))
      .toContain("min-h-11");
  });
});

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}
