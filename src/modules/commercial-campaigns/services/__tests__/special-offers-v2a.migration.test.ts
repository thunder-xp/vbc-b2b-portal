import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261008055311_special_offers_bundle_special_price_v2a.sql"), "utf8");

describe("Special Offers V2A migration contract", () => {
  it("extends campaign-scoped lines only and never mutates commercial truth or duplicates dates", () => {
    expect(sql).toContain("add column bundle_special_unit_price numeric(18,2)");
    expect(sql).not.toMatch(/(?:insert into|update|delete from|alter table) public\.(?:product_prices|price_types|commercial_exchange_rates)/i);
    expect(sql).not.toMatch(/add column (?:starts_at|ends_at)/);
    expect(sql).toContain("published=to_jsonb(i)");
    expect(sql).toContain("a.version_number=c.current_version");
  });
  it("locks private helpers and authorizes bounded Admin reads", () => {
    expect(sql).toContain("cardinality(p_product_ids) not between 1 and 50");
    expect(sql).toContain("public.has_internal_permission('campaigns.edit')");
    expect(sql).toContain("revoke all on function private.resolve_bundle_special_price_v2a(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role");
    expect(sql).toContain("public.has_permission(p_company_id,'pricing.partner_price.view')");
  });
  it("performs one set-based cart merge before any legacy stock gate and preserves evidence/expiry guards", () => {
    const branch = sql.slice(sql.indexOf("  if v_campaign.mechanic_type='bundle_special_price' then"), sql.indexOf("  if not coalesce((v_bundle->>'stockReady')"));
    expect(branch.match(/insert into public\.cart_items/g)).toHaveLength(1);
    expect(branch).not.toMatch(/for .* loop|available_quantity|stockReady/);
    expect(branch).toContain("on conflict(cart_id,product_id,commercial_context_key)");
    expect(branch).toContain("campaign_attribution_fingerprint");
    expect(sql).toContain("'CAMPAIGN_SPECIAL_PRICE'");
    expect(sql).toContain("'ORDER_PRICE_CHANGED'");
    expect(sql).toContain("campaign_conditions_changed_review_cart");
    expect(sql).toContain("duplicate_campaign_pre_bundle_special_v2a");
  });
});
