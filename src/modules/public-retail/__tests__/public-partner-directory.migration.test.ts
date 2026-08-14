import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260814172316_public_partner_directory.sql"), "utf8");

describe("public partner directory migration", () => {
  it("fails closed and never infers publication from active company status", () => {
    expect(sql).toContain("public_directory_visible boolean not null default false");
    expect(sql).toContain("status = 'active' and public_directory_visible = true");
    expect(sql).not.toMatch(/update public\.partner_companies[\s\S]*public_directory_visible\s*=\s*true/i);
  });

  it("returns one bounded allowlist and grants no anonymous table access", () => {
    expect(sql).toContain("create or replace function public.list_public_partner_directory()");
    expect(sql).toContain("'displayName', company.display_name");
    expect(sql).toContain("'logoAssetPath', company.public_directory_logo_asset_path");
    expect(sql).toContain("limit 100");
    expect(sql).toContain("grant execute on function public.list_public_partner_directory() to anon");
    expect(sql).not.toMatch(/grant\s+select[\s\S]+partner_companies[\s\S]+anon/i);
  });

  it("revokes publication when a partner changes an approved logo", () => {
    expect(sql).toContain("before update of logo_asset_path on public.partner_companies");
    expect(sql).toContain("new.public_directory_visible := false");
    expect(sql).toContain("new.public_directory_logo_asset_path := null");
    expect(sql).toContain("revoke all on function public.revoke_public_partner_directory_on_logo_change() from public, anon, authenticated");
  });
});
