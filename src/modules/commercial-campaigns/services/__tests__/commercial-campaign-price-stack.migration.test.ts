import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261004100427_polish_special_offers_partner_price_stack_v3.sql"), "utf8");

describe("commercial campaign governed price stack migration", () => {
  it("excludes inactive, expired, future, unpublished-audience and hidden products", () => {
    expect(migration).toContain("campaign.status in ('active', 'scheduled')");
    expect(migration).toContain("campaign.starts_at <= now()");
    expect(migration).toContain("campaign.ends_at > now()");
    expect(migration).toContain("audience.version_number = campaign.current_version");
    expect(migration).toContain("and audience.included");
    expect(migration).toContain("product.is_active and product.is_visible");
  });
  it("returns only current governed read-model prices and never stores campaign-owned price input", () => {
    expect(migration).toContain("'msrpPrice'");
    expect(migration).toContain("'partnerPrice'");
    expect(migration).toContain("'specialPrice'");
    expect(migration).toContain("item.benefit_type = 'existing_price_profile'");
    expect(migration).toContain("profile.external_ref = item.governed_benefit_reference");
    expect(migration).toContain("price.valid_from <= now()");
    expect(migration).not.toMatch(/insert into public\.product_prices/i);
  });

  it("fails closed outside USD and preserves campaign eligibility and permissions", () => {
    expect(migration).toContain("pricing.partner_price.view");
    expect(migration).toContain("pricing.retail_price.view");
    expect(migration).toContain("upper(coalesce(nullif(btrim(price.currency), ''), nullif(btrim(profile.currency_code), ''), '')) = 'USD'");
    expect(migration).toContain("audience.company_id = p_company_id");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon");
  });
});
