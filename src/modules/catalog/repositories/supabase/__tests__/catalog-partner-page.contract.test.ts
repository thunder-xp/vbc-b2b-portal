import { describe, expect, it } from "vitest";

import {
  CATALOG_PARTNER_PAGE_FIELDS,
  isCatalogPartnerPageRow,
} from "../catalog-partner-page.contract";

describe("catalog partner page contract", () => {
  it("accepts the production-shaped SKU 400691 card contract", () => {
    expect(isCatalogPartnerPageRow(productionCardRow())).toBe(true);
  });

  it.each(["image_url", "partner_price_amount", "msrp_price_amount", "available_quantity"])(
    "rejects a row when required field %s is removed",
    (field) => {
      const row = productionCardRow();
      delete row[field];
      expect(isCatalogPartnerPageRow(row)).toBe(false);
    },
  );

  it("keeps the RPC field allowlist explicit and duplicate-free", () => {
    expect(new Set(CATALOG_PARTNER_PAGE_FIELDS).size).toBe(CATALOG_PARTNER_PAGE_FIELDS.length);
    expect(CATALOG_PARTNER_PAGE_FIELDS).toContain("image_url");
    expect(CATALOG_PARTNER_PAGE_FIELDS).toContain("partner_price_amount");
    expect(CATALOG_PARTNER_PAGE_FIELDS).toContain("msrp_price_amount");
    expect(CATALOG_PARTNER_PAGE_FIELDS).toContain("available_quantity");
  });
});

function productionCardRow(): Record<string, unknown> {
  return {
    id: "a5b6c2d7-dde1-4d91-a901-8e57d8c8728f",
    sku: "400691",
    name: "DH-IPC-HFW2649TL-S-PRO",
    slug: "dh-ipc-hfw2649tl-s-pro",
    image_url: "https://example.test/products/400691.png",
    brand_id: null,
    brand_name: null,
    brand_slug: null,
    category_id: null,
    category_parent_id: null,
    category_name: null,
    category_slug: null,
    partner_price_amount: 102.08,
    partner_price_currency: "USD",
    partner_price_currency_status: "resolved",
    partner_price_updated_at: "2026-07-19T02:21:15Z",
    msrp_price_amount: 177,
    msrp_price_currency: "",
    msrp_price_currency_status: "resolved",
    msrp_price_updated_at: "2026-07-19T02:21:15Z",
    physical_quantity: 22,
    reserved_quantity: 0,
    available_quantity: 22,
    incoming_quantity: 0,
    has_variant_stock: false,
    stock_synced_at: "2026-07-19T06:17:19Z",
    expected_arrival_date: "2026-07-28",
    expected_quantity: 40,
    arrival_published_at: "2026-07-19T06:17:19Z",
    partner_rate: 17.56341414,
    retail_rate: 17.56341414,
    partner_rate_published_at: "2026-07-19T00:00:00Z",
    retail_rate_published_at: "2026-07-19T00:00:00Z",
    can_view_stock: true,
  };
}
