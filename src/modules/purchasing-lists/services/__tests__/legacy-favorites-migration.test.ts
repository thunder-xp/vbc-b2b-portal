import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260721083000_migrate_legacy_catalog_favorites.sql"), "utf8");

describe("legacy favorites migration", () => {
  it("copies only valid active memberships and visible products", () => {
    expect(sql).toContain("membership.status = 'active'");
    expect(sql).toContain("company.status = 'active'");
    expect(sql).toContain("product.is_active and product.is_visible");
    expect(sql).toContain("'legacy_favorite'");
  });

  it("is rerunnable without duplicate lists or products", () => {
    expect(sql).toContain("on conflict (company_id, created_by) where is_system_favorites do nothing");
    expect(sql).toContain("on conflict (list_id, product_id) do nothing");
  });

  it("retains the legacy table as a read-only rollback source", () => {
    expect(sql).toContain("revoke insert, update, delete on table public.partner_product_favorites from authenticated");
    expect(sql).toContain("grant select on table public.partner_product_favorites to authenticated");
    expect(sql).not.toContain("drop table");
  });
});
