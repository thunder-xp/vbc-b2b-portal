import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261004145500_finalize_special_offers_promo_profile_v3.sql"), "utf8");

describe("Special Offers exact PROMO profile contract", () => {
  it("enforces the exact active USD PROMO identity at draft and publication boundaries", () => {
    expect(sql).toContain("b9f5d585-dab1-11e9-8a58-000c29cf9dd4");
    expect(sql).toContain("external_code='UU-000021'");
    expect(sql).toContain("profile.name='PROMO'");
    expect(sql).toContain("CAMPAIGN_PROMO_PROFILE_REQUIRED");
    expect(sql).toContain("CAMPAIGN_PROMO_PRICE_MISSING");
    expect(sql).toContain("price.valid_from<=now()");
    expect(sql).toContain("price.valid_to is null or price.valid_to>=now()");
  });

  it("projects only USD PROMO and preserves informational items without a special price", () => {
    expect(sql).toContain("item.benefit_type = 'existing_price_profile'");
    expect(sql).toContain("item.governed_benefit_reference = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'");
    expect(sql).toContain("'specialPrice'");
    expect(sql).toContain("'currency', 'USD'");
    expect(sql).not.toMatch(/insert into public\.product_prices/i);
  });

  it("keeps privileged functions locked down and blocks browser access to the internal wrapper", () => {
    expect(sql).toContain("security definer set search_path='' set row_security=off");
    expect(sql).toContain("apply_commercial_campaign_draft_pre_promo_v3");
    expect(sql).toMatch(/revoke all on function public\.apply_commercial_campaign_draft_v2\(uuid,integer,uuid,jsonb,uuid\) from public,anon,authenticated/);
    expect(sql).toMatch(/revoke all on function public\.publish_commercial_campaign_pre_promo_v3\(uuid,uuid\) from public,anon,authenticated/);
  });
});
