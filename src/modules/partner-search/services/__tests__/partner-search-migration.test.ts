import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260731190000_partner_workspace_ergonomics.sql"),
  "utf8",
);

describe("partner workspace ergonomics migration", () => {
  it("keeps search read-only and permission-aware", () => {
    expect(sql).toContain("create table public.partner_search_documents");
    expect(sql).toContain("revoke all on public.partner_search_documents from public, anon, authenticated");
    expect(sql).toContain("public.has_permission(p_company_id, 'catalog.view')");
    expect(sql).toContain("public.has_permission(p_company_id, 'purchasing_lists.view')");
    expect(sql).toContain("public.can_access_estimates(p_company_id, 'estimates.view')");
    expect(sql).toContain("document.owner_user_id = auth.uid()");
    expect(sql).not.toContain("external_1c_id, product.name");
  });

  it("limits logo changes to an active partner owner and safe object paths", () => {
    expect(sql).toContain("role.code = 'partner_owner'");
    expect(sql).toContain("target_path !~ ('^' || p_company_id::text");
    expect(sql).toContain("array['image/png', 'image/jpeg', 'image/webp']");
    expect(sql).toContain("revoke all on function public.set_partner_company_logo(uuid, text) from public, anon");
  });

  it("projects supported local domains without live integration calls", () => {
    for (const table of ["catalog_products", "purchasing_lists", "estimates", "estimate_items", "estimate_versions"]) {
      expect(sql).toContain(`on public.${table}`);
    }
    expect(sql).not.toContain("http_request");
    expect(sql).not.toContain("onec");
  });
});
