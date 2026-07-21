import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260721080000_system_favorites_purchasing_list.sql"), "utf8");

describe("system favorites migration", () => {
  it("enforces one protected private favorites list per user and company", () => {
    expect(sql).toContain("purchasing_lists_system_favorites_owner_idx");
    expect(sql).toContain("where is_system_favorites");
    expect(sql).toContain("name = 'Избранное'");
    expect(sql).toContain("visibility = 'private'");
  });

  it("uses narrow authenticated RPC access without direct broad writes", () => {
    expect(sql).toContain("list_system_favorite_product_ids");
    expect(sql).toContain("set_system_favorite");
    expect(sql).toContain("public.has_permission(target_company_id, 'purchasing_lists.manage')");
    expect(sql).toContain("grant execute on function public.set_system_favorite(uuid, uuid, boolean) to authenticated");
    expect(sql).toContain("revoke all on function public.set_system_favorite(uuid, uuid, boolean) from public, anon");
  });

  it("protects system metadata and archive state", () => {
    expect(sql).toContain("System favorites metadata is immutable.");
    expect(sql).toContain("System favorites cannot be archived.");
  });
});
