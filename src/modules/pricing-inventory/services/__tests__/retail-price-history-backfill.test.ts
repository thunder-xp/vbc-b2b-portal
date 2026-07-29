import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260729210000_retail_price_history_backfill.sql"),
  "utf8",
);
const publicationRepairSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260729220000_retail_price_history_backfill_publication_repair.sql",
  ),
  "utf8",
);
const atomicPublicationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260729230000_atomic_retail_history_price_publication.sql",
  ),
  "utf8",
);
const continuityExecutionSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260729231000_retail_history_continuity_execution_context.sql",
  ),
  "utf8",
);
const continuitySnapshotSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260729232000_retail_history_continuity_snapshot_source.sql",
  ),
  "utf8",
);

describe("RETAIL history read repair and authoritative backfill", () => {
  it("keeps the RPC contract and evaluates truncation inside the CTE statement", () => {
    expect(sql).toContain("function public.get_retail_price_history(");
    expect(sql).toContain("(select count(*) from latest)::integer as candidate_count");
    expect(sql).toContain("stats.candidate_count > 500");
    expect(sql).not.toMatch(/select count\(\*\) > 500 from candidates/);
  });

  it("publishes canonical verified MDL RETAIL only", () => {
    expect(sql).toContain("e181c772-93fc-11e9-94cb-000c29cf9dd4");
    expect(sql).toContain("'UU-000020'");
    expect(sql).toContain("'00000000-0000-0000-0000-000000000000'");
    expect(sql).toContain("verification_status <> 'verified'");
    expect(sql).not.toContain("UU-000003");
  });

  it("resolves same-period records deterministically and collapses equal prices", () => {
    expect(sql).toContain("partition by stage.external_product_ref, stage.effective_at");
    expect(sql).toContain("stage.source_ordinal desc");
    expect(sql).toContain("lag(price_amount)");
    expect(sql).toContain("previous_amount is distinct from price_amount");
  });

  it("is append-only, idempotent, and records continuity incidents", () => {
    expect(sql).toContain("on conflict (source_fingerprint) do nothing");
    expect(sql).toContain("RETAIL_HISTORY_CURRENT_MISMATCH");
    expect(sql).toContain("current.price_amount = source.price_amount");
    expect(sql).not.toMatch(/delete from public\.product_price_history/i);
  });

  it("requires permission, reason, verified currency, and a single active run", () => {
    expect(sql).toContain("admin.integrations.manage");
    expect(sql).toContain("char_length(normalized_reason) < 20");
    expect(sql).toContain("RETAIL_HISTORY_CURRENCY_UNVERIFIED");
    expect(sql).toContain("retail_history_one_active_backfill_idx");
  });

  it("makes verification idempotent without duplicating its audit event", () => {
    const idempotentReturn = sql.indexOf("'idempotent', true");
    const auditInsert = sql.indexOf("insert into public.retail_price_history_verification_audit");
    expect(idempotentReturn).toBeGreaterThan(-1);
    expect(auditInsert).toBeGreaterThan(idempotentReturn);
  });

  it("denies browser writes and bounds reads to 500 points", () => {
    expect(sql).toContain("revoke all on public.retail_price_history_backfill_runs from public, anon, authenticated");
    expect(sql).toContain("'pricing.retail_price.view'");
    expect(sql).toContain("limit 501");
    expect(sql).toContain("limit 500");
  });

  it("repairs the production publication alias collision in a later migration", () => {
    expect(publicationRepairSql).toContain("metric_source_rows");
    expect(publicationRepairSql).toContain("metric_mapped_products");
    expect(publicationRepairSql).toContain("set source_rows = metrics.metric_source_rows");
    expect(publicationRepairSql).not.toMatch(
      /select source_count, mapped_count[\s\S]*into source_count, mapped_count/,
    );
  });

  it("publishes history, current prices, and continuity in one transaction", () => {
    const history = atomicPublicationSql.indexOf(
      "publish_retail_price_history_backfill(p_sync_id)",
    );
    const prices = atomicPublicationSql.indexOf(
      "publish_product_price_snapshot(p_sync_id)",
    );
    const continuity = atomicPublicationSql.indexOf(
      "finalize_retail_price_history_continuity(p_sync_id)",
    );
    expect(history).toBeGreaterThan(-1);
    expect(prices).toBeGreaterThan(history);
    expect(continuity).toBeGreaterThan(prices);
    expect(atomicPublicationSql).toContain("A failure rolls back all three");
  });

  it("evaluates continuity outside partner RLS with safe aggregate diagnostics", () => {
    expect(continuityExecutionSql).toContain("set row_security = off");
    expect(continuityExecutionSql).toContain("'sourceProducts', source_products");
    expect(continuityExecutionSql).toContain("'currentProducts', current_products");
    expect(continuityExecutionSql).not.toContain("external_product_ref");
  });

  it("uses the append-only current publication snapshot without widening access", () => {
    expect(continuitySnapshotSql).toContain(
      "history.source in ('initial_baseline', 'price_sync_snapshot')",
    );
    expect(continuitySnapshotSql).toContain("join current_snapshot current");
    expect(continuitySnapshotSql).not.toContain("from public.product_prices");
  });
});
