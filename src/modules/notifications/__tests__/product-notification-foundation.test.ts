import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PARTNER_NOTIFICATION_EVENT_CATALOG,
  PARTNER_NOTIFICATION_GROUPS,
} from "../domain";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730140000_partner_product_notification_foundation.sql",
  ),
  "utf8",
);

describe("watched-product notification foundation", () => {
  it("governs the six product events centrally", () => {
    expect(PARTNER_NOTIFICATION_GROUPS).toContain("products");
    expect(PARTNER_NOTIFICATION_EVENT_CATALOG.cart_product_price_changed.mandatory)
      .toBe(true);
    expect(PARTNER_NOTIFICATION_EVENT_CATALOG.cart_product_availability_changed.mandatory)
      .toBe(true);
    expect(PARTNER_NOTIFICATION_EVENT_CATALOG.watched_product_price_changed.mandatory)
      .toBe(false);
  });

  it("stores only safe state and fingerprints in the transition outbox", () => {
    expect(sql).toContain("create table public.partner_product_transition_events");
    expect(sql).toContain("previous_value_fingerprint text null");
    expect(sql).toContain("new_value_fingerprint text null");
    expect(sql).not.toMatch(/previous_price|new_price|stock_quantity|raw_payload/i);
  });

  it("keeps transition creation server-only", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
  });

  it("allows optional product preferences without weakening mandatory groups", () => {
    expect(sql).toContain("event_group = 'products' or in_app_enabled");
    expect(sql).toContain("p_event_group <> 'products'");
  });

  it("allows only server-owned product and cart deep links", () => {
    expect(sql).toContain("value = '/cabinet/cart'");
    expect(sql).toContain("^/cabinet/catalog/");
  });
});
