import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260904102553_repeat_purchase_opportunities.sql",
  ),
  "utf8",
);
const stockAcceptance = readFileSync(
  resolve(
    "supabase/migrations/20260904104517_repeat_purchase_stock_projection_acceptance.sql",
  ),
  "utf8",
);
const dashboard = readFileSync(
  resolve("src/modules/partner-cabinet/services/workspace-home.service.ts"),
  "utf8",
);
const dashboardView = readFileSync(
  resolve("src/modules/partner-cabinet/components/OperationalDashboard.tsx"),
  "utf8",
);

describe("high-confidence repeat-purchase opportunities", () => {
  it("derives exact-product cadence only from confirmed partner order truth", () => {
    expect(migration).toContain("history.company_id = target_company_id");
    expect(migration).toContain("history.one_c_state_code = 'completed'");
    expect(migration).toContain("history.one_c_posted");
    expect(migration).toContain("not history.one_c_deletion_mark");
    expect(migration).toContain("history.origin_type <> 'internal_1c'");
    expect(migration).toContain("item.product_id is not null");
    expect(migration).not.toMatch(/external_characteristic_ref[\s\S]*coalesce/i);
  });

  it("requires three purchases and calculates transparent cadence and quantity facts", () => {
    expect(migration).toContain("having count(*) >= 3");
    expect(migration).toContain("percentile_disc(0.5) within group (order by sequence.quantity)");
    expect(migration).toContain("percentile_disc(0.5) within group (order by sequence.interval_days)");
    expect(migration).toContain("as latest_interval_days");
    expect(migration).toContain("as days_since_last_purchase");
    expect(migration).toContain("as interval_regularity");
  });

  it("uses the documented due window and suppresses recent or stale cycles", () => {
    expect(migration).toContain("regularity.typical_interval_days between 7 and 365");
    expect(migration).toContain("regularity.interval_regularity >= 0.60");
    expect(migration).toContain("regularity.typical_interval_days * 0.85");
    expect(migration).toContain("regularity.typical_interval_days * 2");
  });

  it("requires an active mapped product and a fresh governed partner price", () => {
    expect(migration).toContain("product.is_active");
    expect(migration).toContain("product.is_visible");
    expect(migration).toContain("nullif(btrim(product.external_1c_id), '') is not null");
    expect(migration).toContain("company.commercial_profile_state = 'aligned'");
    expect(migration).toContain("price.currency_status = 'resolved'");
    expect(migration).toContain("price.price_amount > 0");
    expect(migration).toContain("price.synced_at >= now() - interval '36 hours'");
    expect(migration).toContain("price.company_id is null or price.company_id = target_company_id");
  });

  it("requires fresh authoritative stock and suppresses active-cart products", () => {
    expect(migration).toContain("stock.freshness_state = 'authoritative'");
    expect(migration).toContain("stock.synced_at >= now() - interval '5 hours'");
    expect(stockAcceptance).toContain("interval '24 hours'");
    expect(stockAcceptance).toContain("interval '5 hours'");
    expect(stockAcceptance).toContain("pg_get_functiondef");
    expect(migration).toContain("stock.available_quantity > 0");
    expect(migration).toContain("cart.created_by = member.user_id");
    expect(migration).toContain("cart.status in ('active', 'submitting')");
    expect(migration).toContain("'alreadyInCart', current_cart_item.id is not null");
  });

  it("uses deterministic identity and preserves tenant and permission isolation", () => {
    expect(migration).toContain("target_company_id::text");
    expect(migration).toContain("eligible.user_id::text");
    expect(migration).toContain("'repeat_purchase_available'");
    expect(migration).toContain("eligible.product_id::text");
    expect(migration).toContain("opportunity.recipient_user_id = actor");
    expect(migration).toContain("public.has_permission(target_company_id, 'opportunities.view')");
    expect(migration).toContain("set row_security = off");
    expect(migration).toContain("revoke all on function private.partner_repeat_purchase_candidates(uuid)");
  });

  it("stays off the request path and preserves the bounded revenue hierarchy", () => {
    expect(migration).toContain("partner_commercial_opportunity_dirty_companies");
    expect(migration).toContain("perform private.refresh_partner_repeat_purchase_opportunities");
    expect(migration).toContain("'repeat_purchase_available',\n    'active',\n    90");
    expect(dashboard).toContain("filter: \"all\", limit: 12, offset: 0");
    expect(dashboardView).toContain("opportunities.slice(0, 4)");
    expect(dashboard).not.toContain("partner_order_history");
  });

  it("does not introduce AI, CRM, live 1C, or a second purchase-history store", () => {
    expect(migration).not.toMatch(/vector|embedding|machine.learning|recommendation_status|sales_lead|reorder_task/i);
    expect(migration).not.toMatch(/http|fetch|odata|standardodata/i);
    expect(migration).not.toMatch(/create table[\s\S]*(repeat|purchase_history)/i);
  });
});
