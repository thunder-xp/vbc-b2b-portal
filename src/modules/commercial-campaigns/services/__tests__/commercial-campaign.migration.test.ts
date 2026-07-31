import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260731220000_commercial_campaigns_foundation.sql"), "utf8");
const cleanupSql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260731223000_inactive_campaign_cart_attribution_cleanup.sql"), "utf8");

describe("commercial campaigns database contract", () => {
  it("owns the governed lifecycle and immutable publication history", () => {
    expect(sql).toContain("status in ('draft','scheduled','active','paused','completed','archived')");
    expect(sql).toContain("commercial_campaign_versions");
    expect(sql).toContain("immutable_campaign_versions");
    expect(sql).toContain("audience_rule_snapshot");
    expect(sql).toContain("refresh_commercial_campaign_lifecycle");
  });

  it("snapshots deterministic audiences and denies cross-company reads", () => {
    expect(sql).toContain("commercial_campaign_audience_snapshots");
    expect(sql).toContain("unique(campaign_id, version_number, company_id)");
    expect(sql).toContain("audience.company_id=p_company_id and audience.included");
    expect(sql).toContain("commercial_mode_full");
    expect(sql).toContain("commercial_mode_retail_only");
  });

  it("never accepts portal-owned final pricing", () => {
    expect(sql).toContain("p_input ? 'finalPrice'");
    expect(sql).toContain("p_input ? 'discountAmount'");
    expect(sql).toContain("product_prices");
    expect(sql).toContain("currency_status='resolved'");
    expect(sql).not.toMatch(/commercial_campaign_items[\s\S]{0,700}final_price/i);
  });

  it("enforces minimums, company limits, expiration, and concurrency", () => {
    expect(sql).toContain("p_quantity<item.minimum_quantity");
    expect(sql).toContain("maximum_quantity_per_company");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("new.campaign_attribution_fingerprint:=null");
    expect(cleanupSql).toContain("set campaign_id=null,campaign_item_id=null,campaign_attribution_fingerprint=null");
    expect(cleanupSql).toContain("where campaign_id=new.id");
    expect(sql).toContain("campaign.ends_at>now()");
  });

  it("attributes cart and order once without changing 1C order truth", () => {
    expect(sql).toContain("campaign_attribution_fingerprint");
    expect(sql).toContain("attribute_campaign_order_item");
    expect(sql).toContain("unique(order_item_id, campaign_item_id)");
    expect(sql).not.toContain("Document_ЗаказПокупателя");
  });

  it("uses set-based projections without live 1C or per-product RPC calls", () => {
    expect(sql).toContain("jsonb_agg");
    expect(sql).toContain("product_stock_totals");
    expect(sql).toContain("product_supplier_arrivals");
    expect(sql).not.toContain("ONEC_");
    expect(sql).not.toContain("http(");
  });

  it("indexes only active audience-eligible search documents", () => {
    expect(sql).toContain("'commercial_campaign'");
    expect(sql).toContain("snapshot.included");
    expect(sql).toContain("target.status<>'active'");
    expect(sql).not.toMatch(/safe_metadata[^\n]*internal_note/);
  });

  it("deduplicates meaningful campaign notifications", () => {
    expect(sql).toContain("'campaign_started'");
    expect(sql).toContain("'campaign_ending_soon'");
    expect(sql).toContain("on conflict(recipient_user_id,deduplication_key) do nothing");
  });

  it("keeps every campaign table behind RLS and RPC grants", () => {
    for (const table of ["commercial_campaigns", "commercial_campaign_items", "commercial_campaign_audience_rules", "commercial_campaign_versions", "commercial_campaign_audience_snapshots", "commercial_campaign_audit_events", "commercial_campaign_engagement_events", "commercial_campaign_order_attributions"]) expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain("campaigns.publish");
    expect(sql).toContain("has_internal_permission('campaigns.publish')");
  });
});
