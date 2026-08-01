import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260801130000_dashboard_session_product_selections.sql"), "utf8");

describe("dashboard session product selections migration", () => {
  it("keeps snapshots server-owned, tenant-bound, expiring, and bounded", () => {
    expect(sql).toContain("alter table public.partner_dashboard_selection_snapshots enable row level security");
    expect(sql).toContain("revoke all on public.partner_dashboard_selection_snapshots from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.get_or_refresh_partner_dashboard_selections(uuid, uuid, text) to service_role");
    expect(sql).toContain("membership.user_id = p_user_id");
    expect(sql).toContain("membership.company_id = p_company_id");
    expect(sql).toContain("cardinality(previous_product_ids) <= 12");
    expect(sql).toContain("cardinality(offer_product_ids) <= 5");
    expect(sql).toContain("interval '14 days'");
  });

  it("uses local sources, deterministic ranking, and source fingerprints", () => {
    expect(sql).toContain("count(distinct event.purchase_id) desc");
    expect(sql).toContain("max(event.purchased_at) desc");
    expect(sql).toContain("md5(assignment.product_id::text || ':' || rotation::text)");
    expect(sql).toContain("label.code in ('HOT', 'NEW', 'TOP')");
    expect(sql).toContain("previous_source_fingerprint = previous_fingerprint");
    expect(sql).toContain("offer_source_fingerprint = offer_fingerprint");
    expect(sql).not.toMatch(/http_|net\.http|Document_|InformationRegister_/);
    expect(sql).not.toMatch(/order\s+by\s+random\s*\(/i);
  });

  it("reuses one login generation and invalidates it only when governed sources change", () => {
    expect(sql).toContain("login_generation_hash = login_hash");
    expect(sql).toContain("previous_source_fingerprint = previous_fingerprint");
    expect(sql).toContain("offer_source_fingerprint = offer_fingerprint");
    expect(sql).toContain("on conflict (user_id, company_id, login_generation_hash)");
    expect(sql).toContain("max(history.updated_at)");
    expect(sql).toContain("max(assignment.updated_at)");
  });

  it("governs TOP, NEW, and HOT diversity without duplicate products", () => {
    expect(sql).toContain("partition by label.code");
    expect(sql).toContain("case code when 'HOT' then 1 when 'NEW' then 2 else 3 end");
    expect(sql).toContain("group by product_id");
    expect(sql).toContain("limit 5");
  });

  it("resolves canonical local images without storing commercial values", () => {
    expect(sql).toContain("product.image_source_url, product.image_url");
    expect(sql).toContain("from public.catalog_product_images image");
    expect(sql).not.toMatch(/previous_metrics\s+jsonb[^;]*(partner_price|retail_price)/i);
  });
});
