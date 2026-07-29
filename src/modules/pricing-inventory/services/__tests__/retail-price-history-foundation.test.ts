import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260729190000_retail_price_history_foundation.sql"),
  "utf8",
);

describe("RETAIL price history foundation", () => {
  it("fixes history to canonical UU-000020 and never reuses MSRP", () => {
    expect(sql).toContain("external_price_type_code = 'UU-000020'");
    expect(sql).toContain("e181c772-93fc-11e9-94cb-000c2988d323");
    expect(sql).not.toContain("d9c92519-658b-11e8-80d3-000c29a58b59");
  });

  it("creates an idempotent baseline from currently published MDL RETAIL", () => {
    expect(sql).toContain("'initial_baseline'");
    expect(sql).toContain("on conflict (source_fingerprint) do nothing");
    expect(sql).toContain("price.currency = 'MDL'");
  });

  it("captures current publication and history in the same transaction", () => {
    expect(sql).toContain("create trigger capture_retail_price_history_after_publication");
    expect(sql).toContain("after insert or update");
    expect(sql).toContain("'price_sync_snapshot'");
    expect(sql).toContain("canonical RETAIL currency is not safely resolved");
  });

  it("keeps historical register rows private until audited currency verification", () => {
    expect(sql).toContain("'currency_verification_required'");
    expect(sql).toContain("source <> 'one_c_history'");
    expect(sql).toContain("verification_status = 'verified'");
    expect(sql).toContain("admin.integrations.manage");
    expect(sql).toContain("retail_price_history_verification_audit");
  });

  it("denies browser writes and exposes only canonical retail history", () => {
    expect(sql).toMatch(/revoke all on public\.product_price_history from public, anon, authenticated/);
    expect(sql).toContain("'pricing.retail_price.view'");
    expect(sql).toContain("p_range not in ('3m', '6m', '12m', 'all')");
    expect(sql).toContain("limit 500");
  });

  it("prevents normal hard deletion", () => {
    expect(sql).toContain("product_price_history_append_only");
    expect(sql).toContain("before update or delete");
  });
});
