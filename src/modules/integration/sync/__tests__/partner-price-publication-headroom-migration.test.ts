import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const profileSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914120357_partner_price_publication_profile.sql"),
  "utf8",
);
const optimizedSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914121741_partner_price_publication_delta_headroom.sql"),
  "utf8",
);
const triggerHeadroomSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914135944_partner_price_insert_trigger_headroom.sql"),
  "utf8",
);

describe("partner-price publication headroom migrations", () => {
  it("persists bounded operational diagnostics without exposing a new browser data path", () => {
    expect(profileSql).toContain("delta_unchanged integer not null default 0");
    expect(profileSql).toContain("publication_db_duration_ms bigint not null default 0");
    expect(profileSql).toContain("publication_timeout_budget_ms integer not null default 8000");
    expect(profileSql).toContain("publication_headroom_percent numeric(5,2)");
    expect(profileSql).toContain("publication_warning boolean not null default false");
    expect(profileSql).not.toMatch(/grant\s+(?:select|insert|update|delete)\s+on/i);
  });

  it("never rewrites an unchanged product-price row", () => {
    expect(optimizedSql).toMatch(/on conflict \(product_id, external_1c_price_type_id\) do nothing/i);
    expect(optimizedSql).toMatch(/update public\.product_prices current_price[\s\S]*?is distinct from row/i);
    expect(optimizedSql).not.toMatch(/last_seen_sync_id is distinct from p_sync_id/i);
  });

  it("excludes existing rows before INSERT trigger evaluation", () => {
    expect(triggerHeadroomSql).toMatch(/left join public\.product_prices current_price[\s\S]*?current_price\.id is null[\s\S]*?on conflict/i);
    expect(triggerHeadroomSql).toContain("unchanged rows are excluded before INSERT trigger evaluation");
  });

  it("deactivates only currently active prices that are absent from the governed stage", () => {
    expect(optimizedSql).toMatch(/set is_active = false[\s\S]*?current_price\.is_active[\s\S]*?not exists/i);
    expect(optimizedSql).toMatch(/staged\.external_price_type_ref = current_price\.external_1c_price_type_id/i);
  });

  it("matches the nullable inactive price-type value produced by the existing resolver trigger", () => {
    expect(optimizedSql).toMatch(/case when price_type\.is_active then price_type\.id else null end as price_type_id/i);
  });

  it("keeps one atomic publication batch and warns above seventy percent of the unchanged timeout", () => {
    expect(optimizedSql).toContain("publication_batches = 1");
    expect(optimizedSql).toContain("v_timeout_ms integer := 8000");
    expect(optimizedSql).toContain("publication_warning = v_total_ms > (v_timeout_ms * 0.70)");
    expect(optimizedSql).not.toMatch(/set\s+(?:local\s+)?statement_timeout|alter\s+(?:role|database)[\s\S]*statement_timeout/i);
  });

  it("retains service-role-only execution for the publication boundary", () => {
    expect(optimizedSql).toMatch(/revoke all on function public\.publish_product_prices_with_retail_history\(uuid\)[\s\S]*from public, anon, authenticated/i);
    expect(optimizedSql).toMatch(/grant execute on function public\.publish_product_prices_with_retail_history\(uuid\)[\s\S]*to service_role/i);
    expect(triggerHeadroomSql).toMatch(/revoke all on function public\.publish_product_price_snapshot\(uuid\)[\s\S]*from public, anon, authenticated, service_role/i);
    expect(triggerHeadroomSql).toMatch(/grant execute on function public\.publish_product_price_snapshot\(uuid\)[\s\S]*to service_role/i);
  });
});
