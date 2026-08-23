import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260823074904_commercial_intelligence_foundation.sql"),
  "utf8",
);
const productDetail = readFileSync(resolve("app/(partner)/cabinet/catalog/[slug]/page.tsx"), "utf8");
const cron = readFileSync(resolve("app/api/cron/commercial-intelligence/route.ts"), "utf8");

describe("commercial intelligence foundation", () => {
  it("separates immutable events, derived facts, and decision projections", () => {
    for (const table of [
      "commercial_events", "partner_product_interactions", "competitive_price_snapshots",
      "competitor_market_price_daily", "partner_product_price_pressure", "partner_commercial_snapshots",
      "partner_product_features", "commercial_action_candidates", "commercial_action_outcomes",
    ]) expect(migration).toContain(`create table public.${table}`);
    expect(migration).toContain("prevent_commercial_intelligence_history_mutation");
    expect(migration).toContain("immutable_competitive_price_snapshots");
    expect(migration).toContain("immutable_commercial_action_outcomes");
  });

  it("keeps raw intelligence private and internal aggregate RPCs permissioned", () => {
    expect(migration).toMatch(/revoke all on public\.commercial_events[\s\S]+from public, anon, authenticated/);
    expect(migration).toContain("public.has_internal_permission('admin.analytics.view')");
    expect(migration).not.toContain("grant select on public.partner_product_price_pressure to authenticated");
    expect(migration).toContain("get_admin_competitive_intelligence");
    expect(migration).toContain("get_admin_company_competitive_intelligence");
  });

  it("uses deterministic, currency-safe confidence and comparison rules", () => {
    expect(migration).toContain("when stats.company_count=1 then 0.49");
    expect(migration).toContain("when stats.company_count=2 then 0.74");
    expect(migration).toContain("source.match_method when 'exact_model'");
    expect(migration).toContain("current_date-source.observed_at<=30");
    expect(migration).toContain("enriched.currency<>enriched.novotech_currency then 'incomparable'");
    expect(migration).toContain("<0.01 then 'parity'");
  });

  it("uses one bounded, idempotent, non-overlapping projection worker", () => {
    expect(migration).toContain("pg_try_advisory_xact_lock");
    expect(migration).toContain("for update skip locked limit p_product_limit");
    expect(migration).toContain("p_product_limit not between 1 and 250");
    expect(migration).toContain("on conflict(observation_id) do nothing");
    expect(migration).toContain("on conflict(company_id,product_id) do update");
    expect(cron).toContain("refresh_commercial_intelligence");
    expect(cron).not.toContain("one-c");
  });

  it("does not introduce analytics or live integration work into Product Detail", () => {
    expect(productDetail).not.toContain("commercial-intelligence");
    expect(productDetail).not.toContain("refresh_commercial_intelligence");
    expect(migration).not.toContain("http_post");
    expect(migration).not.toContain("net.http");
  });

  it("supports explicit outcomes without automatic repricing", () => {
    expect(migration).toContain("record_commercial_action_outcome");
    expect(migration).toContain("on conflict(action_candidate_id,correlation_id) do nothing");
    expect(migration).not.toContain("update public.product_prices");
    expect(migration).not.toContain("insert into public.product_prices");
    expect(migration).not.toContain("openai");
    expect(migration).not.toContain("embedding");
  });

  it("provides a bounded versioned future AI context without implementing AI", () => {
    expect(migration).toContain("ai_partner_commercial_context_v1");
    expect(migration).toContain("'contractVersion','v1'");
    expect(migration).toContain("p_product_limit not between 1 and 50");
  });
});

describe("commercial intelligence acceptance contracts", () => {
  it("keeps commercial events append-only", () => {
    expect(migration).toContain("immutable_commercial_events");
  });

  it("isolates partner-product interactions", () => {
    expect(migration).toMatch(/revoke all on public\.commercial_events, public\.partner_product_interactions,[\s\S]+from public, anon, authenticated/);
  });

  it("calculates competitor snapshots from immutable observations", () => {
    expect(migration).toContain("insert into public.competitive_price_snapshots");
    expect(migration).toContain("observation_id uuid not null unique");
  });

  it("calculates absolute price gaps", () => {
    expect(migration).toContain("enriched.novotech_price-enriched.competitor_amount");
  });

  it("calculates percentage price gaps", () => {
    expect(migration).toContain("greatest(enriched.competitor_amount,0.01)*100");
  });

  it("recognizes price parity", () => {
    expect(migration).toContain("then 'parity'");
  });

  it("never compares unlike currencies", () => {
    expect(migration).toContain("then 'incomparable'");
  });

  it("reduces confidence for stale observations", () => {
    expect(migration).toContain("current_date-source.observed_at<=90 then 0.12 else 0.03");
  });

  it("increases evidence only with independent companies", () => {
    expect(migration).toContain("count(distinct other.partner_company_id)");
    expect(migration).toContain("(stats.company_count-1)*0.09");
  });

  it("does not expose contributing partner identities", () => {
    expect(migration).not.toContain("contributing_company_ids");
  });

  it("keeps market aggregates internal", () => {
    expect(migration).toMatch(/public\.competitive_price_snapshots, public\.competitor_market_price_daily,[\s\S]+from public, anon, authenticated/);
  });

  it("projects bounded partner commercial snapshots", () => {
    expect(migration).toContain("insert into public.partner_commercial_snapshots");
    expect(migration).toContain("source_fingerprint");
  });

  it("projects partner-product features", () => {
    expect(migration).toContain("insert into public.partner_product_features");
    expect(migration).toContain("views_30d");
  });

  it("creates candidates only from medium or high confidence evidence", () => {
    expect(migration).toContain("pressure.confidence_level in ('medium','high')");
  });

  it("records explicit action outcomes idempotently", () => {
    expect(migration).toContain("on conflict(action_candidate_id,correlation_id) do nothing");
  });

  it("keeps admin reads bounded", () => {
    expect(migration).toContain("p_limit not between 1 and 100");
    expect(migration).toContain("limit p_limit offset p_offset");
  });

  it("uses batched projections instead of per-product RPC calls", () => {
    expect(cron.match(/\.rpc\(/g)).toHaveLength(2);
    expect(cron).toContain('rpc("refresh_commercial_intelligence"');
    expect(cron).toContain('"reconcile_superseded_external_price_intelligence"');
    expect(migration).toContain("create temporary table ci_products");
  });
});
