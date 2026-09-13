import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260913140557_unified_catalog_management_firebase.sql", "utf8");
const catalogRepository = readFileSync(
  "src/modules/catalog/repositories/supabase/catalog.supabase-repository.ts",
  "utf8",
);

describe("unified catalog management migration", () => {
  it("uses one bounded counter and row projection with canonical flags", () => {
    expect(sql).toContain("get_admin_catalog_management_page_v1");
    for (const flag of ["MISSING_IMAGE", "MISSING_CATEGORY", "MISSING_BRAND", "MISSING_PRICE", "STOCK_UNKNOWN", "HIDDEN_BY_PORTAL", "INACTIVE_IN_1C"]) {
      expect(sql).toContain(`'${flag}'`);
    }
    expect(sql).toContain("stock.freshness_state = 'authoritative'");
    expect(sql).toContain("when page.available_quantity > 0 then 'in_stock'");
    expect(sql).toContain("else 'zero'");
    expect(sql).toContain("limit p_limit offset p_offset");
  });

  it("keeps visibility portal-owned, audited and independent from ERP activation", () => {
    expect(sql).toContain("manage_catalog_product_visibility_v1");
    expect(sql).toContain("set is_visible = p_visible");
    expect(sql).not.toMatch(/set is_visible = p_visible,[\s\S]{0,200}is_active\s*=/);
    expect(sql).toContain("'erpActiveUnchanged', true");
    expect(sql).toContain("'CATALOG_PRODUCT_HIDDEN'");
    expect(sql).toContain("'CATALOG_PRODUCT_PUBLISHED'");
    expect(catalogRepository).toContain(".update(synchronizedPayload)");
    expect(catalogRepository).toMatch(
      /\.insert\(\{[\s\S]{0,160}is_visible: input\.isVisible/,
    );
  });

  it("denies table access, gates RPCs and keeps audit immutable", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toMatch(/revoke all on table public\.catalog_product_management_audit_events,[\s\S]*from public, anon, authenticated/);
    expect(sql).toContain("has_internal_permission('admin.catalog.manage')");
    expect(sql).toContain("has_internal_permission('admin.catalog.view')");
    expect(sql).toContain("Catalog product management audit events are append-only");
  });

  it("integrates unresolved image failures into the existing operational issue model", () => {
    expect(sql).toContain("list_admin_operational_issues_pre_catalog_management");
    expect(sql).toContain("'catalog-image:' || failure.correlation_id");
    expect(sql).toContain("failure.cleanup_status");
  });
});
