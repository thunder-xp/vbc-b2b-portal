import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261020041746_stock_publication_replenishment_lineage_repair.sql"), "utf8");
const outer = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20260914145405_stock_arrivals_publication_delta_headroom.sql"), "utf8");

describe("stock publication replenishment lineage repair", () => {
  it("replaces only the obsolete writer with the existing stock/arrival delegate", () => {
    expect(migration.match(/create or replace function/g)).toHaveLength(1);
    expect(migration).toContain("public.publish_exact_stock_snapshot_replenishment_day_base(");
    expect(migration).toContain("return public.publish_exact_stock_snapshot_current_replenishment_base(p_sync_id)");
    expect(migration).not.toMatch(/\b(insert into|delete from|update) public\./i);
    expect(migration).not.toMatch(/alter table|drop not null|set default/i);
  });

  it("retains invoker security and restricts the compatibility entry point", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("leaves the locked atomic publication followed by canonical reconciliation intact", () => {
    const publication = outer.slice(outer.indexOf("create or replace function public.publish_exact_stock_snapshot(\n"));
    expect(publication).toContain("pg_try_advisory_xact_lock");
    expect(publication.indexOf("public.publish_exact_stock_snapshot_replenishment_day_base(p_sync_id)")).toBeLessThan(
      publication.indexOf("public.reconcile_current_warehouse_replenishment_day(true)"));
    expect(migration).not.toContain("create or replace function public.publish_exact_stock_snapshot(");
    expect(migration).not.toMatch(/exception when|statement_timeout/i);
  });
});
