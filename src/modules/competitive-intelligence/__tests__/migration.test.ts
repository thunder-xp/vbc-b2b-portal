import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260824180021_competitive_price_intelligence.sql"), "utf8");
const actions = readFileSync(resolve("src/modules/competitive-intelligence/actions.ts"), "utf8");

describe("competitive intelligence migration", () => {
  it("creates the dedicated append-oriented domain and local read model", () => {
    for (const table of ["competitive_intelligence_competitors", "competitive_intelligence_competitor_aliases", "competitor_price_observations", "competitive_intelligence_observation_evidence", "competitive_intelligence_reconciliation_queue", "competitive_intelligence_observation_reviews", "competitive_intelligence_events", "competitive_market_price_aggregates", "competitive_signals", "competitive_recommendations", "competitive_intelligence_dirty_products"]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("immutable_competitor_price_observations");
    expect(sql).toContain("supersedes_observation_id");
    expect(sql.includes("comparison_snapshot") || sql.includes("comparison snapshots")).toBe(true);
  });

  it("keeps direct tables private and exposes only governed RPC boundaries", () => {
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.get_partner_product_competitive_intelligence");
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
    expect(sql).toContain("competitive_intelligence.view");
    expect(sql).toContain("competitive_intelligence.manage");
    expect(sql).toContain("admin.market_intelligence.manage");
    expect(actions).toContain("getPartnerWorkspaceContextAction()");
    expect(actions).not.toContain('formData.get("companyId")');
  });

  it("uses a private evidence bucket and validates metadata plus file signatures", () => {
    expect(sql).toContain("'competitive-intelligence-evidence', 'competitive-intelligence-evidence', false");
    expect(sql).toContain("file_size between 1 and 10485760");
    expect(sql).toContain("checksum_sha256");
    expect(sql).toContain("not exists(select 1 from storage.objects");
    expect(actions).toContain("hasValidFileSignature");
    expect(actions).toContain("COMPETITIVE_INTELLIGENCE_MAX_EVIDENCE_BYTES");
  });

  it("aggregates medians in separate currency, VAT and quantity cohorts", () => {
    expect(sql).toContain("percentile_cont(0.5)");
    expect(sql).toContain("effective.currency,effective.vat_mode,effective.quantity_cohort");
    expect(sql).not.toMatch(/\bavg\s*\(\s*effective\.observed_price/i);
    expect(sql).toContain("novotech_comparison_median");
    expect(sql).toContain("comparison_status = 'comparable'");
  });

  it("requires independent contributors before strong recommendations", () => {
    expect(sql).toContain("unique_company_count >= 3 and current.observation_count >= 5");
    expect(sql).toContain("cohort.confidence_level = 'high'");
    expect(sql).toContain("recommendation_generated");
    expect(sql).toContain("competitive_signal_reviews");
    expect(sql).toContain("admin_review_competitive_signal");
    expect(sql).toContain("Competitor alias belongs to another canonical identity");
  });

  it("keeps request paths local and makes background refresh bounded", () => {
    expect(sql).toContain("refresh_competitive_price_intelligence(p_limit integer default 50)");
    expect(sql).toContain("for update skip locked limit p_limit");
    expect(sql).not.toMatch(/http_|net\./i);
  });

  it("keeps submitted competitor normalization unambiguous inside the observation RPC", () => {
    expect(sql).toContain("normalized_submitted_name text;");
    expect(sql).toContain("alias.normalized_alias = normalized_submitted_name");
    expect(sql).not.toMatch(/\r?\n\s{2}normalized_name text;\r?\n/);
  });
});
