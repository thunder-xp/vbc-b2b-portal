import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20260809142000_estimate_fixed_business_sections.sql"), "utf8");

describe("fixed estimate business sections migration", () => {
  it("defines the four canonical section identities and one key per estimate", () => {
    for (const [key, name] of [
      ["equipment", "Оборудование"],
      ["installation_materials", "Монтажные материалы"],
      ["installation_works", "Монтажные работы"],
      ["commissioning_works", "Пусконаладочные работы"],
    ]) {
      expect(migration).toContain(`when '${key}' then '${name}'`);
    }
    expect(migration).toContain("estimate_sections_estimate_system_key_unique");
    expect(migration).toContain("where system_key is not null");
  });

  it("initializes every governed creation path atomically", () => {
    expect(migration.match(/perform public\.initialize_canonical_estimate_sections\(created\.id\)/g)).toHaveLength(3);
    expect(migration.match(/section_id := public\.initialize_canonical_estimate_sections\(created\.id\)/g)).toHaveLength(2);
    expect(migration).toContain("create or replace function public.create_estimate_v2");
    expect(migration).toContain("create or replace function public.create_estimate_from_cart");
    expect(migration).toContain("create or replace function public.create_estimate_from_purchasing_list");
  });

  it("protects canonical structure while leaving historical sections untouched", () => {
    expect(migration).toContain("old.system_key is not null");
    expect(migration).toContain("Canonical estimate section structure is immutable.");
    expect(migration).not.toMatch(/update\s+public\.estimate_sections\s+set\s+system_key/i);
    expect(migration).not.toContain("delete from public.estimate_sections");
  });

  it("does not expose trigger or initialization helpers", () => {
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("revoke all on function public.protect_canonical_estimate_section() from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.initialize_canonical_estimate_sections(uuid) from public, anon, authenticated");
  });
});
