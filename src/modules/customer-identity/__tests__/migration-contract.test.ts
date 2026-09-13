import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260913110249_shared_customer_identity_and_agent_domain_foundation.sql"), "utf8");

describe("shared customer identity migration", () => {
  it("is additive and keeps existing customer runtime keys", () => {
    expect(sql).toContain("create table public.customer_identities");
    expect(sql).toContain("add column customer_identity_id uuid null");
    expect(sql).not.toMatch(/drop table|alter column id|drop constraint/i);
    expect(sql).toContain("where customer_identity_id is null");
  });

  it("protects identity data and browser context isolation", () => {
    for (const table of ["customer_identities", "customer_identity_keys", "customer_external_refs", "customer_identity_reconciliation_cases", "customer_identity_events"]) {
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role`);
    }
    expect(sql).not.toMatch(/grant select[^;]+to authenticated/i);
    expect(sql).toContain("key_version integer not null");
    expect(sql).toContain("key_hash ~ '^[0-9a-f]{64}$'");
  });
});
