import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260730090000_admin_retail_history_absence_diagnostic.sql",
  ),
  "utf8",
);

describe("active partner-visible products without canonical RETAIL history RPC", () => {
  it("enforces internal price permission and remains read-only", () => {
    expect(sql).toContain("has_internal_permission('admin.prices.view')");
    expect(sql).toContain("language plpgsql");
    expect(sql).toContain("stable");
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\b\s+(into\s+)?public\./i);
    expect(sql).not.toContain("http_");
    expect(sql).not.toContain("net.http");
  });

  it("restricts the diagnostic to the active visible portal publication root", () => {
    expect(sql).toContain("product.is_active");
    expect(sql).toContain("product.is_visible");
    expect(sql).toContain("product.source_root_1c_id = catalog_state.root_external_1c_id");
    expect(sql).toContain("catalog_state.status = 'succeeded'");
  });

  it("uses canonical RETAIL history and current price evidence in batch CTEs", () => {
    expect(sql).toContain("history.source = 'one_c_history'");
    expect(sql).toContain("external_price_type_code = 'UU-000020'");
    expect(sql).toContain("e181c772-93fc-11e9-94cb-000c2988d323");
    expect(sql).toContain("current_retail as");
    expect(sql).toContain("history_evidence as");
    expect(sql).toContain("group by history.product_id");
    expect(sql).toContain("where one_c_points = 0");
  });

  it("supports all safe absence classifications without merging unresolved history", () => {
    for (const reason of [
      "no_retail_register_record",
      "baseline_only_new_product",
      "current_price_without_historical_source",
      "source_record_not_currently_authoritative",
      "unknown_requires_review",
    ]) {
      expect(sql).toContain(reason);
    }
    expect(sql).toContain("'unresolvedOutOfScopeHistoricalReferences'");
    expect(sql).toContain("latest_backfill.unresolved_products");
  });

  it("bounds pagination and applies server-side search/category/reason filters", () => {
    expect(sql).toContain("least(greatest(coalesce(p_page_size, 25), 1), 50)");
    expect(sql).toContain("position(lower(normalized_search) in lower(sku))");
    expect(sql).toContain("p_category_id is null or category_id = p_category_id");
    expect(sql).toContain("normalized_reason is null or absence_reason = normalized_reason");
    expect(sql).toContain("limit safe_page_size");
    expect(sql).toContain("offset (safe_page - 1) * safe_page_size");
  });
});
