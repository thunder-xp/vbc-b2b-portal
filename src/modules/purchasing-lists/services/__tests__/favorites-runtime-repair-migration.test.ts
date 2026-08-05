import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260805120000_system_favorites_runtime_repair.sql"),
  "utf8",
);

describe("system Favorites runtime repair migration", () => {
  it("uses the named item uniqueness constraint and avoids the ambiguous output name", () => {
    expect(sql).toContain("on conflict on constraint purchasing_list_items_product_unique do nothing");
    expect(sql).not.toContain("on conflict (list_id, product_id)");
  });

  it("stores presentation fallbacks without storing commercial truth", () => {
    expect(sql).toContain("product_name_snapshot");
    expect(sql).toContain("product_image_url_snapshot");
    expect(sql).toContain("created_by uuid null references public.user_profiles");
    expect(sql).toContain("product_snapshot.name, coalesce(product_snapshot.image_source_url, product_snapshot.image_url), auth.uid()");
    expect(sql).not.toContain("price_snapshot");
    expect(sql).not.toContain("stock_snapshot");
  });

  it("orders user-created lists before the protected default Favorites list", () => {
    expect(sql).toContain("order by list.is_system_favorites asc, list.created_at desc, list.id");
  });

  it("preserves RLS-backed permissions and restricted function grants", () => {
    expect(sql).toContain("public.has_permission(target_company_id, 'purchasing_lists.manage')");
    expect(sql).toContain("security definer set search_path = public");
    expect(sql).toContain("revoke all on function public.set_system_favorite(uuid, uuid, boolean) from public, anon");
  });
});
