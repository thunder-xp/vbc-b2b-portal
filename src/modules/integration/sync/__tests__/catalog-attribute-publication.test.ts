import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { normalizeCatalogAttributes, type CatalogAttributeSourceRow } from "../catalog-attribute-publication";
import { catalogPersistenceError } from "../catalog-persistence-error";

describe("catalog attribute normalization", () => {
  it("merges duplicate product/property rows into one conflict key", () => {
    const result = normalizeCatalogAttributes([
      row({ displayValue: "Beta", rawValue: "Beta" }),
      row({ displayValue: "Alpha", rawValue: "Alpha" }),
    ], now);

    expect(result).toMatchObject({ received: 2, uniquePairs: 1, duplicatePairs: 1, multiValueMerges: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ display_value: "Alpha, Beta", raw_value: ["Alpha", "Beta"] });
    expect(new Set(result.rows.map((item) => `${item.product_id}:${item.property_ref}`)).size).toBe(result.rows.length);
  });

  it("prefers resolved, visible, non-empty and filterable values deterministically", () => {
    const result = normalizeCatalogAttributes([
      row({ resolutionStatus: "unresolved", visible: false, filterable: false, displayValue: "", rawValue: "raw" }),
      row({ resolutionStatus: "resolved", resolvedDisplayValue: "Resolved", resolvedValueRef: "value-ref", visible: true, filterable: true, displayValue: "raw", rawValue: "raw" }),
    ], now);

    expect(result.rows[0]).toMatchObject({ resolution_status: "resolved", resolved_display_value: "Resolved", is_visible: true, is_filterable: true });
  });

  it("deduplicates readable values and produces stable ordering independent of input order", () => {
    const values = [row({ displayValue: "Zulu", rawValue: "Zulu" }), row({ displayValue: "Alpha", rawValue: "Alpha" }), row({ displayValue: "Alpha", rawValue: "Alpha" })];
    const forward = normalizeCatalogAttributes(values, now);
    const reverse = normalizeCatalogAttributes([...values].reverse(), now);

    expect(forward.rows).toEqual(reverse.rows);
    expect(forward.rows[0].display_value).toBe("Alpha, Zulu");
    expect(forward.rows[0].raw_value).toEqual(["Alpha", "Zulu"]);
  });
});

describe("catalog attribute persistence safety", () => {
  it("preserves safe Supabase metadata without payload data", () => {
    const error = catalogPersistenceError("attribute_staging", {
      code: "21000",
      message: "ON CONFLICT command cannot affect row a second time",
      details: 'constraint "catalog_product_attributes_product_id_property_ref_key"',
      hint: "Deduplicate proposed rows",
      productId: "secret-product",
      propertyRef: "secret-property",
    }, 4, 200);

    expect(error.metadata).toEqual({ code: "21000", databaseMessage: "ON CONFLICT command cannot affect row a second time", details: 'constraint "catalog_product_attributes_product_id_property_ref_key"', hint: "Deduplicate proposed rows", constraint: "catalog_product_attributes_product_id_property_ref_key", batchIndex: 4, batchRowCount: 200 });
    expect(JSON.stringify(error)).not.toContain("secret-product");
    expect(JSON.stringify(error)).not.toContain("secret-property");
  });

  it("publishes and removes stale rows in one RPC transaction after all staging", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260712170000_catalog_attribute_transactional_publication.sql"), "utf8");
    const publish = sql.indexOf("insert into public.catalog_product_attributes");
    const staleCleanup = sql.indexOf("delete from public.catalog_product_attributes");
    const stageCleanup = sql.indexOf("delete from public.catalog_product_attribute_sync_stage where sync_id = p_sync_id");

    expect(sql).toContain("primary key (sync_id, product_id, property_ref)");
    expect(sql).toContain("on conflict (product_id, property_ref) do update");
    expect(publish).toBeGreaterThan(-1);
    expect(staleCleanup).toBeGreaterThan(publish);
    expect(stageCleanup).toBeGreaterThan(staleCleanup);
  });

  it("does not emit product, property or value data through persistence errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = catalogPersistenceError("attribute_publication", { code: "23514", message: "unsafe raw message" }, 2, 100);
    console.error({ event: "catalog_daily_sync_failed", errorCategory: error.errorCategory, failedStage: error.failedStage, databaseErrorCode: error.metadata.code, failedBatch: error.metadata.batchIndex });
    expect(spy.mock.calls.flat()).not.toContain(expect.stringMatching(/product|property|value/i));
    spy.mockRestore();
  });
});

const now = "2026-07-12T12:00:00.000Z";
function row(overrides: Partial<CatalogAttributeSourceRow> = {}): CatalogAttributeSourceRow {
  return {
    productId: "product-id",
    propertyRef: "property-ref",
    key: "attribute-key",
    label: "Attribute",
    rawValue: "Value",
    displayValue: "Value",
    resolvedDisplayValue: null,
    resolvedValueRef: null,
    resolutionStatus: "not_required",
    valueType: "string",
    filterable: false,
    visible: true,
    available: true,
    sourceUpdatedAt: null,
    ...overrides,
  };
}
