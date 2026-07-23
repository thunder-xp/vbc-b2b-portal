import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const boundaryMigrationPath = resolve("supabase/migrations/20260723090000_estimate_cart_unicode_boundary.sql");
const repairMigrationPath = resolve("supabase/migrations/20260723091000_estimate_section_mojibake_repair.sql");
const duplicateMigrationPath = resolve("supabase/migrations/20260723092000_estimate_duplicate_unicode_boundary.sql");

describe("estimate Unicode integrity", () => {
  it("replaces the cart conversion RPC with a correct UTF-8 section literal", () => {
    expect(existsSync(boundaryMigrationPath)).toBe(true);
    if (!existsSync(boundaryMigrationPath)) return;
    const sql = readFileSync(boundaryMigrationPath, "utf8");
    expect(sql).toContain("create or replace function public.create_estimate_from_cart");
    expect(sql).toContain("values (created.id, 'Оборудование', 0)");
    expect(sql).not.toContain("РћР±РѕСЂСѓРґРѕРІР°РЅРёРµ");
  });

  it("repairs only the proven literal and remains idempotent", () => {
    expect(existsSync(repairMigrationPath)).toBe(true);
    if (!existsSync(repairMigrationPath)) return;
    const sql = readFileSync(repairMigrationPath, "utf8");
    expect(sql).toContain("set name = 'Оборудование'");
    expect(sql).toContain("where name = 'РћР±РѕСЂСѓРґРѕРІР°РЅРёРµ'");
    expect(sql).toContain("event.event_type = 'created_from_cart'");
    expect(sql).toContain("get diagnostics repaired_count = row_count");
    expect(sql).not.toMatch(/convert_(from|to)|encode\(|decode\(/i);
  });

  it("keeps runtime conversion free of text transcoding and render-time repair", () => {
    const files = [
      "src/modules/estimates/actions/lifecycle.actions.ts",
      "src/modules/estimates/services/lifecycle.service.ts",
      "src/modules/estimates/repositories/supabase/lifecycle.supabase-repository.ts",
      "src/modules/estimates/components/EstimateCommercialEditor.tsx",
    ];
    const source = files.map((file) => readFileSync(resolve(file), "utf8")).join("\n");
    expect(source).not.toMatch(/TextDecoder|TextEncoder|decodeURIComponent|unescape\(|convertMojibake|repairMojibake/i);
    expect(source).not.toContain("РћР±РѕСЂСѓРґРѕРІР°РЅРёРµ");
  });

  it("duplicates exact Unicode text and keeps purchasing-list defaults valid", () => {
    const duplicateSql = readFileSync(duplicateMigrationPath, "utf8");
    const purchasingListSql = readFileSync(resolve("supabase/migrations/20260720040000_saved_purchasing_lists.sql"), "utf8");
    expect(duplicateSql).toContain("source.name || ' (копия)'");
    expect(duplicateSql).toContain("select created.id, name, sort_order, show_subtotal, discount_percent");
    expect(duplicateSql).not.toContain("РєРѕРїРёСЏ");
    expect(purchasingListSql).toContain("values (created.id, 'Оборудование', 0)");
  });
});
