import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260712200000_exact_stock_sync_foundation.sql"),
  "utf8",
);

describe("exact stock publication SQL", () => {
  it("subtracts reservations without allowing negative availability", () => {
    expect(sql).toContain("greatest(0,m.physical-m.reserved)");
    expect(sql).toContain("coalesce(r.quantity,0) reserved");
  });

  it("defaults missing incoming to zero", () => {
    expect(sql).toContain("coalesce(i.quantity,0) incoming");
  });

  it("keeps characteristic stock separate and totals only zero characteristic", () => {
    expect(sql).toContain("external_characteristic_ref");
    expect(sql).toContain(
      "filter(where b.external_characteristic_ref='00000000-0000-0000-0000-000000000000')",
    );
  });

  it("includes only explicitly public warehouses in partner totals", () => {
    expect(sql).toContain("w.public_included");
    expect(sql).toContain("s.external_ref='86197770-0aac-431a-aad6-8e7099029bbb'");
    expect(sql).toContain("else coalesce(w.public_included,false)");
    expect(sql).not.toContain("lower(s.name)");
  });

  it("aggregates duplicate Balance keys in the defensive RPC", () => {
    expect(sql).toContain("sum(quantity) quantity");
    expect(sql).toContain(
      "group by external_product_ref, external_warehouse_ref, external_characteristic_ref",
    );
  });

  it("replaces a retried source page instead of double counting it", () => {
    expect(sql).toContain("source_page integer not null");
    expect(sql).toContain("balance_kind=p_kind and source_page=p_source_page");
  });

  it("publishes and cleans staging in one transaction", () => {
    expect(sql.indexOf("insert into public.product_stock_balances")).toBeLessThan(
      sql.lastIndexOf("delete from public.stock_balance_sync_stage"),
    );
  });
});
