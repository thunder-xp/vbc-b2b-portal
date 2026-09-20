import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260920064058_final_customer_digital_security_passport_v1.sql"), "utf8");

describe("Final Customer Digital Security Passport migration", () => {
  it("creates only the minimal Portal-owned object and confirmed-purchase relationship", () => {
    expect(sql).toContain("create table public.customer_objects");
    expect(sql).toContain("create table public.customer_object_purchase_links");
    expect(sql).not.toContain("create table public.customer_security_systems");
    expect(sql).not.toMatch(/serial_number|warranty_start|commissioned_at|installer_id/i);
    expect(sql).toContain("orders.status = 'confirmed'");
    expect(sql).toContain("orders.paid_at is not null");
  });

  it("forces owner-scoped RLS and grants browsers no mutation authority", () => {
    for (const table of ["customer_objects", "customer_object_purchase_links"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
    }
    expect(sql).toContain("account.auth_user_id = (select auth.uid())");
    expect(sql).toContain("grant select on public.customer_objects, public.customer_object_purchase_links to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*to authenticated/i);
  });

  it("keeps object mutations service-only and validates account, identity and actor together", () => {
    expect(sql).toContain("account.id = p_customer_account_id");
    expect(sql).toContain("account.customer_identity_id = p_customer_identity_id");
    expect(sql).toContain("account.auth_user_id = p_actor_user_id");
    expect(sql).toContain("revoke all on function public.create_customer_object_v1");
    expect(sql).toContain("grant execute on function public.create_customer_object_v1");
  });

  it("adds optional service context without changing service lifecycle states", () => {
    expect(sql).toContain("add column customer_object_id uuid null");
    expect(sql).toContain("create_customer_service_request_v3");
    expect(sql).toContain("Purchase is not linked to customer object");
    expect(sql).not.toMatch(/alter table public\.customer_service_requests[\s\S]*drop constraint.*status/i);
  });
});
