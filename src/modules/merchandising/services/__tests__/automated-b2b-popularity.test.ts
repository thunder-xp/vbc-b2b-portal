import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = read("supabase/migrations/20260909164852_automated_b2b_popular_product_ranking.sql");
const admin = read("src/modules/merchandising/components/MerchandisingAdminTable.tsx");
const service = read("src/modules/merchandising/services/merchandising.service.ts");
const catalogRepository = read("src/modules/catalog/repositories/supabase/catalog.supabase-repository.ts");
const dashboardRepository = read("src/modules/partner-cabinet/repositories/supabase-workspace-dashboard.repository.ts");
const dailyRefresh = read("app/api/cron/order-history-refresh/route.ts");
const bootstrapRefresh = read("app/api/cron/order-history-bootstrap/route.ts");
const manualRefresh = read("src/modules/orders/actions/order.actions.ts");

describe("automated B2B Popular contract", () => {
  it("ranks all governed mapped purchases by quantity with deterministic tie breaks", () => {
    expect(migration).toContain("sum(governed.quantity) as total_purchased_quantity");
    expect(migration).toMatch(/history\.partner_visible[\s\S]*history\.one_c_posted[\s\S]*not history\.one_c_deletion_mark/);
    expect(migration).toMatch(/item\.product_id is not null[\s\S]*item\.quantity > 0/);
    expect(migration).toMatch(/product\.is_active[\s\S]*product\.is_visible/);
    expect(migration).toMatch(/total_purchased_quantity desc,[\s\S]*purchasing_company_count desc,[\s\S]*authoritative_order_count desc,[\s\S]*authoritative_line_count desc,[\s\S]*last_purchased_at desc,[\s\S]*product\.sku,[\s\S]*aggregate\.product_id/);
    expect(migration).not.toMatch(/interval\s+'(?:30|90|365) days'/i);
  });

  it("keeps every rank internally and publishes an idempotent Top 40", () => {
    expect(migration).toContain("create table public.b2b_product_demand_ranking");
    expect(migration).toContain("on conflict (product_id) do update");
    expect(migration).toContain("where ranking.popularity_rank <= 40");
    expect(migration).toContain("1001 - ranking.popularity_rank");
    expect(migration).toMatch(/on conflict \(product_id, label_code, source\)[\s\S]*do update/);
    expect(migration).toContain("Outside current automated B2B demand Top 40");
  });

  it("keeps raw global demand private and exposes only existing TOP assignments", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toMatch(/revoke all on table public\.b2b_product_demand_ranking,[\s\S]*from public, anon, authenticated, service_role/);
    expect(migration).toMatch(/revoke all on function public\.refresh_b2b_product_demand_ranking\(\)[\s\S]*from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.refresh_b2b_product_demand_ranking\(\)[\s\S]*to service_role/);
    expect(catalogRepository).not.toContain("b2b_product_demand_ranking");
    expect(dashboardRepository).not.toContain("b2b_product_demand_ranking");
    expect(migration).toContain("hydrate_public_retail_product_presentation");
  });

  it("removes manual Popular while preserving valid manual campaign types", () => {
    expect(admin).not.toContain('<option value="TOP">');
    expect(admin).toContain('<option value="NEW">');
    expect(admin).toContain('<option value="HOT">');
    expect(admin).toContain('<option value="SPECIAL_OFFER">');
    expect(service).toContain("MERCHANDISING_POPULAR_SYSTEM_MANAGED");
    expect(migration).toContain("prevent_manual_popular_management");
    expect(migration).toContain("Superseded by automated B2B demand ranking");
  });

  it("refreshes from existing order-history lifecycle without another scheduler", () => {
    expect(dailyRefresh).toContain("refreshB2bPopularity()");
    expect(bootstrapRefresh).toContain("refreshB2bPopularity()");
    expect(manualRefresh).toContain("refreshPopularityProjection(");
    expect(migration).not.toMatch(/pg_cron|cron\.schedule/i);
  });
});

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}
