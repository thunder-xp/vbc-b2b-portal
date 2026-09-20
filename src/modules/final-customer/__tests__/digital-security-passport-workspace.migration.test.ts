import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260920072436_final_customer_digital_security_passport_workspace_v2.sql"), "utf8");

describe("Final Customer Digital Security Passport workspace V2 migration", () => {
  it("adds an append-only organization audit without inventing an installed-system master", () => {
    expect(sql).toContain("create table public.customer_object_events");
    expect(sql).toContain("customer_object_events_immutable");
    expect(sql).not.toMatch(/create table public\.(customer_)?security_systems/i);
    expect(sql).not.toMatch(/serial_number|warranty_start|commissioned_at|installer_id/i);
  });

  it("keeps browser access owner-scoped and all mutation/read RPCs service-only", () => {
    expect(sql).toContain("alter table public.customer_object_events force row level security");
    expect(sql).toContain("account.auth_user_id = (select auth.uid())");
    expect(sql).toContain("grant select on public.customer_object_events to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*customer_object_events.*to authenticated/i);
    for (const name of ["create_customer_object_v2", "update_customer_object_v2", "archive_customer_object_v2", "assign_customer_object_purchase_v2", "get_customer_object_workspace_v2", "get_customer_object_detail_v2"]) {
      expect(sql).toContain(`revoke all on function public.${name}`);
      expect(sql).toContain(`grant execute on function public.${name}`);
    }
  });

  it("permits only factual paid-purchase organization and blocks unsafe reassignment", () => {
    expect(sql).toContain("orders.status = 'confirmed'");
    expect(sql).toContain("orders.paid_at is not null");
    expect(sql).toContain("Archived object purchase history cannot be reassigned");
    expect(sql).toContain("Purchase has customer service context");
    expect(sql).toContain("'PURCHASE_REASSIGNED'");
  });

  it("returns one bounded workspace read without live integration work", () => {
    expect(sql).toContain("create or replace function public.get_customer_object_detail_v2");
    expect(sql).toContain("limit 20");
    expect(sql).toContain("limit 10");
    expect(sql).toContain("limit 5");
    expect(sql).toContain("public.public_retail_products");
    expect(sql).toContain("public.catalog_product_documents");
    expect(sql).not.toMatch(/http_|net\.|onec|1c_/i);
  });
});
