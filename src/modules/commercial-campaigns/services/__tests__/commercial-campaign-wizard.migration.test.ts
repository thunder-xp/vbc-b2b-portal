import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260924193000_commercial_campaign_wizard_hardening.sql"), "utf8");

describe("commercial campaign wizard migration", () => {
  it("repairs the production image-path regex failure without weakening the 500-character bound", () => {
    expect(sql).not.toContain("[A-Za-z0-9_./-]{1,500}");
    expect(sql).toContain("char_length(image_asset_path) between 1 and 500");
    expect(sql).toContain("image_asset_path ~ '^/[A-Za-z0-9_./-]+$'");
  });

  it("provides one bounded local catalog query with groups, brands, stock and governed price", () => {
    expect(sql).toContain("search_commercial_campaign_products_v1");
    expect(sql).toContain("p_limit not between 1 and 30");
    expect(sql).toContain("with recursive category_scope");
    expect(sql).toContain("public.product_stock_totals");
    expect(sql).toContain("public.product_prices");
    expect(sql).toContain("price_type.external_code = 'UU-000020'");
    expect(sql).not.toMatch(/http|odata|one_c_/i);
  });

  it("makes draft creation atomic and idempotent with safe validation codes", () => {
    expect(sql).toContain("unique(created_by, creation_request_id)");
    expect(sql).toContain("on conflict(created_by, creation_request_id) do nothing");
    for (const code of ["CAMPAIGN_NAME_REQUIRED", "CAMPAIGN_PRODUCTS_REQUIRED", "CAMPAIGN_PRODUCT_LIMIT_INVALID", "CAMPAIGN_AUDIENCE_REQUIRED", "CAMPAIGN_PERIOD_INVALID", "CAMPAIGN_CODE_CONFLICT"]) expect(sql).toContain(code);
    expect(sql).toContain("coalesce(jsonb_typeof(p_input), '') <> 'object'");
    expect(sql).toContain("jsonb_array_length(p_input->'companyIds') not between 1 and 100");
    expect(sql).toContain("coalesce(v_item->>'sortOrder', '') !~ '^[0-9]{1,5}$'");
    expect(sql).toContain("char_length(coalesce(v_item->>'partnerMessage', '')) > 500");
  });

  it("keeps search and creation permission-gated", () => {
    expect(sql.match(/has_internal_permission\('campaigns\.create'\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("revoke all on function public.search_commercial_campaign_products_v1");
    expect(sql).toContain("revoke all on function public.create_commercial_campaign_draft(jsonb) from public, anon");
  });

  it("surfaces only bounded safe creation failures in existing Admin Operations", () => {
    expect(sql).toContain("create table public.commercial_campaign_creation_failures");
    expect(sql).toContain("record_commercial_campaign_creation_failure");
    expect(sql).toContain("list_admin_operational_issues_pre_campaign_creation");
    expect(sql).toContain("'actorUserId', failure.actor_user_id");
    expect(sql).toContain("'hasDraftData', failure.has_draft_data");
    expect(sql).toContain("where created_at >= p_now - interval '24 hours'");
    expect(sql).not.toContain("database_error_message");
  });
});
