import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261004170000_special_offers_2_wave1a_quantity_promo.sql"), "utf8");
const foundationSql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260731220000_commercial_campaigns_foundation.sql"), "utf8");

describe("Special Offers Quantity to PROMO migration", () => {
  it("stores one explicit mechanic and a bounded per-product threshold", () => {
    expect(sql).toContain("mechanic_type text not null default 'legacy_promo'");
    expect(sql).toContain("promo_threshold_quantity integer null");
    expect(sql).toContain("promo_threshold_quantity between 1 and 9999");
    expect(sql).toContain("maximum_quantity_per_company >= promo_threshold_quantity");
  });

  it("enforces the exact synchronized 1C PROMO identity without accepting a manual selling price", () => {
    expect(sql).toContain("b9f5d585-dab1-11e9-8a58-000c29cf9dd4");
    expect(sql).toContain("UU-000021");
    expect(sql).toContain("profile.name = 'PROMO'");
    expect(sql).toContain("CAMPAIGN_PRICE_OWNERSHIP_DENIED");
    expect(sql).not.toMatch(/add column (campaign_price|discount_amount|final_price)/i);
    expect(sql).not.toMatch(/insert into public\.product_prices/i);
  });

  it("keeps eligibility server-side and audience/lifecycle scoped", () => {
    expect(sql).toContain("resolve_commercial_campaign_item_eligibility_v1");
    expect(sql).toContain("public.has_permission(p_company_id, 'campaigns.view')");
    expect(sql).toContain("audience.version_number = v_campaign.current_version");
    expect(sql).toContain("v_campaign.starts_at > now() or v_campaign.ends_at <= now()");
    expect(sql).toContain("p_quantity < v_item.promo_threshold_quantity");
  });

  it("preserves immutable publication evidence and enriches existing attribution", () => {
    expect(sql).toContain("publication_version integer null");
    expect(sql).toContain("mechanic_threshold_quantity integer null");
    expect(sql).toContain("publish_commercial_campaign_pre_quantity_promo_wave1a");
    expect(foundationSql).toContain("campaign_snapshot");
    expect(foundationSql).toContain("item_snapshot");
    expect(sql).toContain("attribute_commercial_campaign_order_item");
  });

  it("locks down privileged functions with empty search paths and minimal grants", () => {
    expect(sql).toContain("set search_path = ''");
    expect(sql).toMatch(/revoke all on function public\.resolve_commercial_campaign_item_eligibility_v1\(uuid, uuid, integer\) from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.resolve_commercial_campaign_item_eligibility_v1\(uuid, uuid, integer\) to authenticated/);
    expect(sql).toMatch(/revoke all on function public\.apply_commercial_campaign_draft_pre_quantity_promo_wave1a\(uuid, integer, uuid, jsonb, uuid\)[\s\S]*authenticated/);
  });
});
