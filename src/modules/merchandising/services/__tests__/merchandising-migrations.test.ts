import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const foundation = fs.readFileSync(path.join(
  root,
  "supabase/migrations/20260728180000_catalog_merchandising_foundation.sql",
), "utf8");
const projection = fs.readFileSync(path.join(
  root,
  "supabase/migrations/20260728183000_catalog_merchandising_projection.sql",
), "utf8");
const analytics = fs.readFileSync(path.join(
  root,
  "supabase/migrations/20260728190000_partner_behavior_analytics_foundation.sql",
), "utf8");
const repair = fs.readFileSync(path.join(
  root,
  "supabase/migrations/20260728213000_catalog_merchandising_mutation_and_preview_repair.sql",
), "utf8");

describe("merchandising and analytics SQL boundaries", () => {
  it("enables RLS, revokes browser writes, and audits mutations", () => {
    expect(foundation).toContain("enable row level security");
    expect(foundation).toContain("revoke all on table public.product_merchandising_assignments");
    expect(foundation).toContain("product_merchandising_audit_events");
    expect(foundation).toContain("admin.catalog.manage");
  });

  it("filters active labels before deterministic pagination in one aggregate", () => {
    expect(projection).toContain("create or replace function public.catalog_partner_page_v3");
    expect(projection).toContain("p_merchandising_label");
    expect(projection).toContain("assignment.starts_at <= now()");
    expect(projection).toContain("assignment.ends_at is null or assignment.ends_at > now()");
    expect(projection).toContain("row_number() over");
    expect(projection).toContain("'merchandising_labels'");
  });

  it("keeps events append-only, company-bound, and aggregate-only for admins", () => {
    expect(analytics).toContain("partner_behavior_events");
    expect(analytics).toContain("auth.uid(), p_company_id");
    expect(analytics).toContain("has_active_company_membership(p_company_id)");
    expect(analytics).toContain("prevent_partner_behavior_event_mutation");
    expect(analytics).toContain("revoke all on table public.partner_behavior_events");
    expect(analytics).toContain("admin.analytics.view");
  });

  it("never publishes analytics recommendations automatically", () => {
    expect(foundation).toContain("analytics_recommendation");
    expect(foundation).toContain("is_curated_visible = false");
    expect(projection).toContain("assignment.source in ('manual', 'one_c')");
  });

  it("repairs mutation ambiguity with an atomic idempotent v2 RPC", () => {
    expect(repair).toContain("manage_product_merchandising_v2");
    expect(repair).toContain("target_product_id");
    expect(repair).not.toContain("where product.id = product_id");
    expect(repair).toContain("product_merchandising_audit_request_idx");
    expect(repair).toContain("pg_advisory_xact_lock");
    expect(repair).toContain("MERCHANDISING_AUDIT_FAILURE");
    expect(repair).toContain("request_id");
  });

  it("keeps the admin preview aggregate-only and commercially redacted", () => {
    expect(repair).toContain("get_admin_merchandising_preview");
    expect(repair).toContain("admin.catalog.view");
    expect(repair).toContain("row_number() over");
    expect(repair).not.toContain("'priceAmount'");
    expect(repair).not.toContain("'partnerPrice'");
    expect(repair).not.toContain("partner_behavior_events");
  });
});
