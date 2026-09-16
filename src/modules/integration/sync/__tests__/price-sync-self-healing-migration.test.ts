import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260916110047_onec_price_sync_self_healing.sql"),
  "utf8",
);

describe("price sync self-healing migration", () => {
  it("uses a durable watermark with a bounded overlap only for incremental runs", () => {
    expect(sql).toContain("source_watermark");
    expect(sql).toContain("- interval '48 hours'");
    expect(sql).toMatch(/source_watermark\s*=\s*greatest\(source_watermark, run_latest_source_period\)/);
    expect(sql.indexOf("source_watermark = greatest")).toBeGreaterThan(sql.indexOf("publish_product_prices_with_retail_history(p_sync_id)"));
  });

  it("keeps absent active rows in incremental staging and lets full reconciliation remove them", () => {
    expect(sql).toContain("if v_mode = 'incremental' then");
    expect(sql).toContain("from public.product_prices price");
    expect(sql).toContain("on conflict (sync_id, external_product_ref, external_price_type_ref, external_characteristic_ref)");
    expect(sql).toContain("where excluded.effective_at > staged.effective_at");
  });

  it("tracks independent domain freshness and never stages final-customer BCR prices into partner publication", () => {
    for (const scope of ["PARTNER_CONTRACT_PRICE", "FINAL_CUSTOMER_RETAIL_PRICE", "INTERNAL/OTHER", "MSRP", "RETAIL"]) {
      expect(sql).toContain(`'${scope}'`);
    }
    expect(sql).toContain("registry.price_domain = 'FINAL_CUSTOMER_RETAIL_PRICE'");
    expect(sql).toContain("publication_required");
  });

  it("detects scheduler silence independently from source and publication freshness", () => {
    expect(sql).toContain("PRICE_SYNC_SCHEDULER_STALE");
    expect(sql).toContain("last_scheduler_seen_at < p_now - interval '5 minutes'");
    expect(sql).toContain("PRICE_SYNC_SOURCE_STALE");
  });

  it("uses bounded retry backoff and preserves last-good publication on failure", () => {
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("interval '30 minutes'");
    expect(sql).not.toMatch(/delete\s+from\s+public\.product_prices/i);
    expect(sql).toContain("Последняя подтверждённая публикация остаётся активной");
  });

  it("keeps browser roles away from state and audit tables", () => {
    expect(sql).toMatch(/revoke all on table public\.price_sync_domain_freshness from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on table public\.price_sync_run_history from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.are_price_derived_indicators_fresh\(\)\s+to authenticated/);
  });
});
