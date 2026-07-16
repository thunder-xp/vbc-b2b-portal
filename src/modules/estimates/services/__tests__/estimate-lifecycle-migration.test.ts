import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260716190000_estimate_versions_workflow.sql"), "utf8");

describe("estimate lifecycle migration", () => {
  it("creates immutable, company-scoped sequential versions", () => {
    expect(sql).toContain("create table if not exists public.estimate_versions");
    expect(sql).toContain("unique (estimate_id, version_number)");
    expect(sql).toContain("select * into target from public.estimates where id = target_estimate_id for update");
    expect(sql).toContain("coalesce(max(version_number), 0) + 1");
    expect(sql).toContain("grant select on table public.estimate_versions");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)[^;]*estimate_versions/i);
  });

  it("enforces one-way idempotent workflow transitions and exact PDF linkage", () => {
    expect(sql).toContain("if current_version.status = target_status then return current_version; end if;");
    expect(sql).toContain("current_version.status = 'prepared' and target_status = 'sent'");
    expect(sql).toContain("current_version.status = 'sent' and target_status in ('accepted', 'rejected')");
    expect(sql).toContain("where d.version_id = current_version.id and d.status = 'ready'");
    expect(sql).toContain("accepted_version_id = current_version.id");
    expect(sql).toContain("version_id uuid null references public.estimate_versions(id) on delete restrict");
  });

  it("copies versions, revisions, duplicates, and carts in bounded SQL flows", () => {
    for (const rpc of [
      "create_estimate_version", "restore_estimate_draft_from_version", "duplicate_estimate",
      "create_estimate_from_cart", "merge_estimate_products_into_cart",
    ]) expect(sql).toContain(`function public.${rpc}`);
    expect(sql).toContain("perform set_config('app.estimate_bulk_operation', 'true', true)");
    expect(sql).toContain("insert into public.estimate_items(");
    expect(sql).toContain("on conflict (cart_id, product_id) do update");
    expect(sql).toContain("public.cart_items.quantity + excluded.quantity");
  });

  it("proves cart rows and estimate/version products server-side", () => {
    expect(sql).toContain("join public.cart_items cart_item on cart_item.cart_id = target_cart.id");
    expect(sql).toContain("cart_item.quantity");
    expect(sql).toContain("estimate_item.line_type = 'product'");
    expect(sql).toContain("jsonb_array_elements(source_version.snapshot -> 'items')");
    expect(sql).toContain("snapshot_item ->> 'product_id' = row.product_id::text");
  });

  it("keeps templates customer-safe and audit events bounded", () => {
    expect(sql).toContain("'reusableLines'");
    expect(sql).toContain("i.line_type in ('service', 'custom')");
    expect(sql).not.toMatch(/estimate_structure[^;]*(customer_name|project_name|selling_unit_price)/i);
    expect(sql).toContain("'version_created'");
    expect(sql).toContain("'added_to_cart'");
  });
});
