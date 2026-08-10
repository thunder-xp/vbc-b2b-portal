import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260810220000_estimate_catalog_product_entry.sql"),
  "utf8",
);

describe("atomic catalog product estimate entry", () => {
  it("creates the estimate and its product line in one transaction-scoped RPC", () => {
    expect(sql).toContain("public.create_estimate_v3");
    expect(sql).toContain("section.system_key = 'equipment'");
    expect(sql).toContain("public.add_estimate_items_v2");
    expect(sql).toContain("jsonb_array_length(line_items) <> 1");
  });

  it("uses a security-definer function with an explicit search path and governed grants", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("to authenticated");
  });
});
