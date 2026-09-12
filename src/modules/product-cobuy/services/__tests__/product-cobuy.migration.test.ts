import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260912092424_automated_partner_cobuy_market_basket.sql",
  ),
  "utf8",
);
const orderHistoryRefresh = readFileSync(
  join(root, "app/api/cron/order-history-refresh/route.ts"),
  "utf8",
);
const bootstrapRefresh = readFileSync(
  join(root, "app/api/cron/order-history-bootstrap/route.ts"),
  "utf8",
);
const merchandisingService = readFileSync(
  join(root, "src/modules/merchandising/services/merchandising.service.ts"),
  "utf8",
);

describe("anonymous partner co-buy projection migration", () => {
  it("uses only governed completed order history in an inclusive rolling-365 window", () => {
    expect(migration).toContain("history.partner_visible");
    expect(migration).toContain("history.one_c_posted");
    expect(migration).toContain("not history.one_c_deletion_mark");
    expect(migration).toContain("history.one_c_state_code = 'completed'");
    expect(migration).toContain("statement_timestamp() at time zone 'Europe/Chisinau'");
    expect(migration).toContain("governed_window_start := governed_business_date - 364");
    expect(migration).not.toMatch(/cart|draft|viewed|clicked|crm/i);
  });

  it("counts each product once per order regardless of duplicate lines or quantity", () => {
    expect(migration).toMatch(/select distinct\s+history\.id as authoritative_order_id[\s\S]*item\.product_id/);
    expect(migration).toContain("candidate.authoritative_order_id = source.authoritative_order_id");
    expect(migration).toContain("candidate.product_id <> source.product_id");
    expect(migration).toContain("count(distinct source.authoritative_order_id) as pair_order_count");
    expect(migration).not.toMatch(/sum\(item\.quantity\)|sum\(governed\.quantity\)/i);
  });

  it("enforces calibrated privacy and quality thresholds before persistence", () => {
    expect(migration).toContain("measured.pair_order_count >= 3");
    expect(migration).toContain("measured.pair_company_count >= 3");
    expect(migration).toContain("measured.confidence >= 0.05");
    expect(migration).toContain("measured.lift > 1");
    expect(migration).toContain("count(distinct source.company_id)::integer as pair_company_count");
  });

  it("persists the full qualifying set with the exact deterministic ranking", () => {
    expect(migration).toMatch(/partition by qualifying\.source_product_id[\s\S]*qualifying\.pair_company_count desc,[\s\S]*qualifying\.confidence desc,[\s\S]*qualifying\.lift desc,[\s\S]*qualifying\.pair_order_count desc,[\s\S]*qualifying\.latest_pair_at desc,[\s\S]*candidate\.sku,[\s\S]*qualifying\.candidate_product_id/);
    const refreshBody = migration.match(/create or replace function public\.refresh_partner_product_cobuy_associations\(\)[\s\S]*?end;\n\$\$;/)?.[0] ?? "";
    expect(refreshBody).not.toMatch(/association_rank\s*<=|limit\s+5/i);
  });

  it("keeps aggregates private and exposes only five current candidate IDs", () => {
    expect(migration).toContain("force row level security");
    expect(migration).toMatch(/revoke all on table public\.partner_product_cobuy_associations[\s\S]*from public, anon, authenticated/);
    expect(migration).toContain("returns table(candidate_product_id uuid)");
    expect(migration).toContain("public.has_permission(membership.company_id, 'catalog.view')");
    expect(migration).toContain("candidate.is_active");
    expect(migration).toContain("candidate.is_visible");
    expect(migration).toContain("limit least(greatest(coalesce(p_limit, 5), 1), 5)");
    const partnerRead = migration.match(/create or replace function public\.get_partner_product_cobuy_candidates[\s\S]*?end;\n\$\$;/)?.[0] ?? "";
    expect(partnerRead).not.toMatch(/pair_order_count|pair_company_count|confidence|lift/);
  });

  it("reuses existing order-history refresh paths without a new scheduler", () => {
    expect(orderHistoryRefresh).toContain("refreshB2bPopularity()");
    expect(bootstrapRefresh).toContain("refreshB2bPopularity()");
    expect(merchandisingService).toContain("refreshPartnerCoBuy()");
    expect(migration).not.toMatch(/pg_cron|cron\.schedule/i);
  });
});
