import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260904044444_proactive_price_coverage_guard.sql",
), "utf8");
const snapshotPublication = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260712180000_chunked_price_sync_foundation.sql",
), "utf8");
const targetedPublication = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260801120000_order_price_freshness_recovery.sql",
), "utf8");
const activeCartCountRepair = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260904044818_governed_price_coverage_active_cart_count.sql",
), "utf8");
const recentGapSurface = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260904045247_surface_recent_price_coverage_gaps.sql",
), "utf8");

describe("proactive governed price coverage migration", () => {
  it("uses one set-based buying-context audit with active carts before recent orders", () => {
    expect(migration).toContain("private.governed_price_coverage_exposure_facts()");
    expect(migration).toContain("'active_cart'::text as exposure_kind");
    expect(migration).toContain("'recent_order'::text");
    expect(migration).toMatch(/case when bool_or\(facts\.exposure_kind = 'active_cart'\) then 1 else 2 end/i);
    expect(migration).not.toMatch(/for\s+[^\n]+\s+in\s+select/i);
  });

  it("requires the exact product and governed price type while accepting a global price row", () => {
    expect(migration).toContain("price.product_id = product.id");
    expect(migration).toContain("price.external_price_type_ref = lower(company.external_1c_price_type_id)");
    expect(migration).toContain("price.company_id is null or price.company_id = company.id");
    expect(migration).toContain("price.currency_status = 'resolved'");
    expect(migration).toContain("price.price_amount > 0");
  });

  it("does not add fallback pricing or mutate partner carts", () => {
    expect(migration).not.toMatch(/retail.*fallback|fallback.*price|exchange_rate|currency_conversion/i);
    expect(migration).not.toMatch(/(?:update|delete\s+from)\s+public\.carts/i);
    expect(migration).not.toMatch(/(?:update|delete\s+from)\s+public\.cart_items/i);
  });

  it("keeps candidate access internal and denies partner or anonymous execution", () => {
    expect(migration).toMatch(/revoke all on function public\.list_governed_price_coverage_candidates\(integer\)[\s\S]*?from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.list_governed_price_coverage_candidates\(integer\)[\s\S]*?to service_role/i);
    expect(migration).toMatch(/get_admin_governed_price_coverage[\s\S]*?has_internal_permission\('admin\.prices\.view'\)/i);
    expect(migration).toMatch(/revoke all on function public\.get_admin_governed_price_coverage\(\)[\s\S]*?from public, anon/i);
  });

  it("preserves complete-snapshot deletion and new-price publication semantics", () => {
    expect(snapshotPublication).toMatch(/insert into public\.product_prices[\s\S]*?on conflict \(product_id, external_1c_price_type_id\)[\s\S]*?do update/i);
    expect(snapshotPublication).toMatch(/update public\.product_prices\s+set is_active = false[\s\S]*?last_seen_sync_id is distinct from p_sync_id/i);
    expect(targetedPublication).toMatch(/publish_order_price_refresh[\s\S]*?where parsed\.amount > 0 and parsed\.is_active/i);
    expect(targetedPublication).toMatch(/company_id[\s\S]*?select product_id, null, p_external_price_type_ref/i);
  });

  it("reports only meaningful buying-context gaps instead of materializing the catalog Cartesian product", () => {
    expect(migration).toContain("'potentialProductPriceTypePairs', catalog.active_products * catalog.used_price_types");
    expect(migration).toContain("'meaningfulBuyingContextPairs'");
    expect(migration).toContain("'theoreticalGapsTreatedAsIssues', false");
    expect(migration).not.toMatch(/cross join\s+used_price_types/i);
  });

  it("reports all active carts separately from the non-empty audited population", () => {
    expect(activeCartCountRepair).toContain("where cart.status in ('active', 'submitting')");
    expect(activeCartCountRepair).toContain("'{summary,activeCarts}'");
    expect(activeCartCountRepair).toContain("'{summary,nonEmptyActiveCarts}'");
    expect(activeCartCountRepair).toContain("item.quantity > 0");
    expect(activeCartCountRepair).not.toMatch(/for\s+[^\n]+\s+in\s+select/i);
  });

  it("surfaces active-cart gaps before recent buying-context gaps", () => {
    expect(recentGapSurface).toContain("bool_or(facts.exposure_kind = 'active_cart')");
    expect(recentGapSurface).toContain("case when issue.has_active_cart then 'high' else 'medium' end");
    expect(recentGapSurface).toContain("order by issue.has_active_cart desc");
    expect(recentGapSurface).not.toMatch(/for\s+[^\n]+\s+in\s+select/i);
  });
});
