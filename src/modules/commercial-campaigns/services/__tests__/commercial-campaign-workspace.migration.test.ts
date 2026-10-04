import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261004061916_rebuild_admin_special_offers_workspace_v2.sql"), "utf8");

describe("Special Offers workspace database contract", () => {
  it("updates only drafts with a row lock, optimistic revision, and idempotent request", () => {
    expect(sql).toContain("update_commercial_campaign_draft_v2");
    expect(sql).toContain("for update");
    expect(sql).toContain("CAMPAIGN_DRAFT_REQUIRED");
    expect(sql).toContain("CAMPAIGN_DRAFT_CONFLICT");
    expect(sql).toContain("last_edit_request_id=p_request_id");
    expect(sql).toContain("draft_revision=draft_revision+1");
  });
  it("keeps privileged functions locked down and published snapshots untouched", () => {
    expect(sql).toContain("security definer set search_path='' set row_security=off");
    expect(sql).toContain("has_internal_permission('campaigns.edit')");
    expect(sql).toContain("has_internal_permission('campaigns.create')");
    expect(sql).not.toContain("Campaign draft creation requires edit capability");
    expect(sql).toMatch(/revoke all on function public\.apply_commercial_campaign_draft_v2\(uuid,integer,uuid,jsonb,uuid\) from public,anon,authenticated/);
    expect(sql).toMatch(/revoke all on function[\s\S]*public\.update_commercial_campaign_draft_v2/);
    expect(sql).not.toMatch(/update public\.commercial_campaign_versions/i);
    expect(sql).not.toMatch(/delete from public\.commercial_campaign_versions/i);
  });
  it("uses bounded local search and rejects arbitrary campaign prices", () => {
    expect(sql).toContain("search_commercial_campaign_products_v2");
    expect(sql).toContain("p_limit not between 1 and 50");
    expect(sql).toContain("product_stock_totals");
    expect(sql).toContain("CAMPAIGN_PRICE_OWNERSHIP_DENIED");
    expect(sql).toContain("CAMPAIGN_PROFILE_INVALID");
    expect(sql).toContain("catalog_products_campaign_sku_trgm_idx");
    expect(sql).toContain("p_category_id");
    expect(sql).toContain("p_in_stock_only");
    expect(sql).toContain("search_commercial_campaign_companies_v1");
    expect(sql).not.toContain("ONEC_BASE_URL");
  });
  it("persists every governed audience mode and validates profiles again at publication", () => {
    for (const mode of ["explicit_company", "all_active_partners", "commercial_mode_full", "commercial_mode_retail_only", "momentum_slowing", "momentum_attention"]) expect(sql).toContain(mode);
    expect(sql).toMatch(/create function public\.publish_commercial_campaign[\s\S]*CAMPAIGN_PROFILE_INVALID[\s\S]*publish_commercial_campaign_pre_workspace_v2/);
    expect(sql).toContain("commercial_campaign_audience_snapshots");
  });
  it("supports archive, resume, duplicate, governed assets, and discoverable archived rows", () => {
    expect(sql).toContain("duplicate_commercial_campaign_v1");
    expect(sql).toContain("archive_commercial_campaign_v1");
    expect(sql).toContain("resume_commercial_campaign_v1");
    expect(sql).toContain("commercial_campaign_assets");
    expect(sql).not.toContain("campaign.status<>'archived'");
  });
});
