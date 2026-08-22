import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260822130642_group_current_replenishment_by_business_day.sql",
), "utf8");
const indexSql = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260822131331_index_current_replenishment_lineage_foreign_keys.sql",
), "utf8");

describe("current replenishment business-day migration", () => {
  it("selects the latest completed local business day that has an exact visible catalog mapping", () => {
    expect(sql).toContain("select max(state.source_document_date)");
    expect(sql).toContain("business_timezone = 'Europe/Chisinau'");
    expect(sql).toContain("product.external_1c_id = item.external_product_ref");
    expect(sql).toContain("product.is_active and product.is_visible");
    expect(sql).toContain("current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'");
    expect(sql).not.toContain("max(state.last_seen_at)");
  });

  it("unions every completed source on the selected day and retains private lineage", () => {
    expect(sql).toContain("current_warehouse_replenishment_sources");
    expect(sql).toContain("current_warehouse_replenishment_item_sources");
    expect(sql).toContain("state.source_document_date = selected_date");
    expect(sql).toContain("source_quantity numeric(18,3)");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("from public, anon, authenticated");
    expect(indexSql).toContain("current_warehouse_replenishment_sources(source_order_ref)");
    expect(indexSql).toContain("singleton_key, source_order_ref");
  });

  it("deduplicates canonical products while preserving every mapped source line", () => {
    expect(sql).toContain("select distinct on (product.id)");
    expect(sql).toContain("primary key (\n    singleton_key, product_id, source_order_ref, source_line_number");
    expect(sql).toContain("unique_product_count");
  });

  it("keeps the same batch for late same-day sources and replaces it for a newer qualifying day", () => {
    expect(sql).toContain("existing_lineage_date");
    expect(sql).toContain("is distinct from selected_date then\n    selected_batch_id := gen_random_uuid()");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("reconciles after synchronized source publication and exposes no request-time ERP path", () => {
    expect(sql).toContain("publish_exact_stock_snapshot_replenishment_day_base");
    expect(sql).toContain("reconcile_current_warehouse_replenishment_day(true)");
    expect(sql).not.toContain("Document_ЗаказПоставщику");
    expect(sql).not.toContain("http");
  });

  it("uses one stable day event and archives receipt-level attention", () => {
    expect(sql).toContain("'warehouse_replenishment_day'");
    expect(sql).toContain("company.id::text, selected_batch_id::text");
    expect(sql).toContain("notification.entity_id is distinct from selected_batch_id");
    expect(sql).toContain("'duplicate_business_state'");
  });
});
