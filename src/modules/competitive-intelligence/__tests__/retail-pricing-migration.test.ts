import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20260825175319_central_competitor_retail_pricing.sql"), "utf8");
const page = readFileSync(resolve("app/(partner)/cabinet/catalog/[slug]/page.tsx"), "utf8");
const workspace = readFileSync(resolve("src/modules/partner-cabinet/services/workspace-capability.service.ts"), "utf8");

describe("central competitor retail pricing", () => {
  it("creates explicit nomenclature, append-only retail history, and a bounded latest projection", () => {
    for (const table of ["competitor_products", "competitor_retail_price_imports", "competitor_retail_price_import_rows", "competitor_retail_price_observations", "current_competitor_retail_prices"]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("immutable_competitor_retail_observations");
    expect(migration).toContain("mapping_status in ('mapped','unmapped','ambiguous','ignored')");
    expect(migration).toContain("No SKU equality is implied");
  });

  it("keeps tables private and exposes role-scoped RPC boundaries", () => {
    expect(migration).toMatch(/revoke all on public\.competitor_products,[\s\S]+from public, anon, authenticated/);
    expect(migration).toContain("public.has_internal_permission('admin.market_intelligence.manage')");
    expect(migration).toContain("public.can_access_competitive_intelligence(p_company_id,'competitive_intelligence.view')");
    expect(migration).toContain("observation.partner_company_id=p_company_id");
    expect(migration).toContain("revoke all on function public.get_partner_product_competitor_pricing(uuid,uuid) from public, anon");
    expect(migration).not.toMatch(/grant execute on function public\.get_partner_product_competitor_pricing\(uuid,uuid\) to anon/);
  });

  it("uses one Overview RPC without upload-history scans, N+1, or live ERP", () => {
    const fn = migration.slice(migration.indexOf("create or replace function public.get_partner_product_competitor_pricing"), migration.indexOf("create or replace function public.get_admin_product_market_intelligence"));
    expect(fn).toContain("from public.current_competitor_retail_prices current");
    expect(fn).toContain("left join lateral");
    expect(fn).not.toContain("competitor_retail_price_import_rows");
    expect(page).toContain("getProductPricing(companyId, product.id)");
    expect(page).not.toMatch(/ExternalPriceRepository|OneC|integration\/providers/);
  });

  it("migrates only the business-confirmed Exterior retail revision", () => {
    expect(migration).toContain("Price_Exterior 08.08.2026_edit.xlsx");
    expect(migration).toContain("upload.price_schema='retail'");
    expect(migration).toContain("business_confirmed_retail_revision");
    expect(migration).not.toMatch(/partner_price[^\n]+competitor_retail_price_observations/i);
  });

  it("keeps imports idempotent and rejects conflicting duplicate prices before publication", () => {
    expect(migration).toContain("unique(competitor_id, source_file_hash)");
    expect(migration).toContain("if target.status='applied'");
    expect(migration).toContain("Conflicting duplicate retail prices require review.");
    expect(migration.indexOf("Conflicting duplicate retail prices require review.")).toBeLessThan(migration.indexOf("insert into public.competitor_retail_price_observations"));
  });

  it("separates admin retail references from negotiated partner aggregates", () => {
    expect(migration).toContain("'retailReferences'");
    expect(migration).toContain("'cohorts'");
    expect(migration).toContain("from public.current_competitor_retail_prices current");
    expect(migration).toContain("from public.competitive_market_price_aggregates aggregate");
    expect(migration).toMatch(/review on true\)\s*\)\s*from public\.catalog_products product/);
  });

  it("removes the standalone supplier-price capability from partner navigation", () => {
    expect(workspace).not.toContain('key: "external_prices"');
    expect(workspace).not.toContain('href: "/cabinet/competitor-prices"');
  });
});
