import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730143000_product_notification_watcher_projection.sql",
  ),
  "utf8",
);
const stockSync = fs.readFileSync(
  path.join(process.cwd(), "src/modules/integration/sync/chunked-stock-sync.ts"),
  "utf8",
);
const priceSync = fs.readFileSync(
  path.join(process.cwd(), "src/modules/integration/sync/chunked-price-sync.ts"),
  "utf8",
);
const projection = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/modules/integration/sync/product-notification-projection.ts",
  ),
  "utf8",
);

describe("watched-product notification projection", () => {
  it("resolves Favorites, lists, and active carts in one set-based batch", () => {
    expect(sql).toContain("with list_watchers as");
    expect(sql).toContain("cart_watchers as");
    expect(sql).toContain("group by source.product_id, source.company_id, source.user_id");
    expect(sql).not.toMatch(/for\s+.*\s+in\s+select/i);
  });

  it("collapses multiple watcher sources and prioritizes cart intent", () => {
    expect(sql).toContain("bool_or(source.has_cart)");
    expect(sql).toContain("when eligible.has_cart");
    expect(sql).toContain("'watcherSources'");
  });

  it("enforces retail-only and partner-price visibility", () => {
    expect(sql).toContain("'pricing.partner_price.view'");
    expect(sql).toContain("'e181c772-93fc-11e9-94cb-000c29cf9dd4'");
    expect(sql).toContain("company.external_1c_price_type_id");
  });

  it("suppresses only optional product notifications", () => {
    expect(sql).toContain("where not candidate.mandatory");
    expect(sql).toContain("candidate.product_notifications_enabled");
    expect(sql).toContain("candidate.delivery_mode = 'off'");
  });

  it("projects after successful publication without blocking it", () => {
    expect(stockSync.indexOf("publish_exact_stock_snapshot")).toBeLessThan(
      stockSync.indexOf("projectPartnerProductTransitions(id)"),
    );
    expect(priceSync.indexOf("publish_product_prices_with_retail_history")).toBeLessThan(
      priceSync.indexOf("projectPartnerProductTransitions(syncId)"),
    );
    expect(projection).toContain("try {");
    expect(projection).not.toContain("throw error");
  });

  it("stores no raw price or stock value in notification payloads", () => {
    expect(sql).not.toMatch(
      /jsonb_build_object\([\s\S]{0,300}(price_amount|available_quantity)/,
    );
  });

  it("is bounded, retryable, and idempotent", () => {
    expect(sql).toContain("least(greatest(coalesce(p_limit, 500), 1), 1000)");
    expect(sql).toContain("processing_attempts < 5");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain(
      "on conflict (recipient_user_id, deduplication_key) do nothing",
    );
  });
});
