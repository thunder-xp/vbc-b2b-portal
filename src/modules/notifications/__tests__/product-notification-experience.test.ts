import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730144000_product_notification_experience_and_health.sql",
  ),
  "utf8",
);
const page = fs.readFileSync(
  path.join(process.cwd(), "app/(partner)/cabinet/notifications/page.tsx"),
  "utf8",
);
const dashboard = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/modules/partner-cabinet/services/workspace-home.service.ts",
  ),
  "utf8",
);

describe("watched-product notification experience", () => {
  it("supports the products inbox filter with the existing keyset query", () => {
    expect(page).toContain('{ value: "products", label: "Товары" }');
    expect(sql).toContain(
      "'orders', 'shipments', 'company_access', 'products'",
    );
    expect(sql).toContain(
      "(notification.occurred_at, notification.id)",
    );
  });

  it("shows only mandatory cart product changes on dashboard attention", () => {
    expect(dashboard).toContain('item.eventCode === "cart_product_price_changed"');
    expect(dashboard).toContain(
      'item.eventCode === "cart_product_availability_changed"',
    );
    expect(dashboard).not.toContain(
      'item.eventCode === "watched_product_price_changed"',
    );
  });

  it("exposes only aggregate product health", () => {
    expect(sql).toContain("'productTransitionsCaptured'");
    expect(sql).toContain("'productWatcherRecipientsResolved'");
    expect(sql).toContain("'oldestUnprocessedProductTransition'");
    expect(sql).not.toMatch(/safe_payload|price_amount|available_quantity/);
  });

  it("registers non-blocking product-notification analytics", () => {
    expect(sql).toContain("'product_notification_opened'");
    expect(sql).toContain("'product_notification_product_opened'");
    expect(sql).toContain("'product_notification_cart_opened'");
  });
});
