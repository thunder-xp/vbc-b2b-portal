import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260919204430_final_customer_purchase_entitlement_cutover_v1.sql"),
  "utf8",
);

describe("Final Customer purchase entitlement cutover SQL", () => {
  it("seeds one closed immutable legacy cohort and exposes no runtime writer", () => {
    expect(migration).toContain("create table public.customer_account_legacy_entitlements");
    expect(migration).toContain("insert into public.customer_account_legacy_entitlements");
    expect(migration).toContain("select account.id, account.auth_user_id");
    expect(migration).toContain("prevent_customer_legacy_entitlement_mutation");
    expect(migration).toContain("grant select on table public.customer_account_legacy_entitlements to service_role");
    expect(migration).not.toContain("grant insert on table public.customer_account_legacy_entitlements");
  });

  it("resolves access with one service-only fixed-search-path projection", () => {
    const body = functionBody("resolve_customer_access_entitlement_v1");
    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = ''");
    expect(body).toContain("customer_account_purchase_entitlements");
    expect(body).toContain("customer_account_legacy_entitlements");
    expect(migration).toContain("revoke all on function public.resolve_customer_access_entitlement_v1(uuid)\nfrom public, anon, authenticated, service_role");
    expect(migration).toContain("grant execute on function public.resolve_customer_access_entitlement_v1(uuid) to service_role");
  });

  it("removes the generic service-role account creation authority", () => {
    expect(migration).toContain("revoke insert on table public.customer_accounts from service_role");
    expect(migration).toContain("classify_customer_account_access_v1");
    expect(migration).toContain("'PURCHASE_BACKED'");
    expect(migration).toContain("'LEGACY_COMPATIBILITY'");
  });
});

function functionBody(name: string) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"));
  expect(match, `${name} function missing`).not.toBeNull();
  return match?.[0].toLowerCase() ?? "";
}
