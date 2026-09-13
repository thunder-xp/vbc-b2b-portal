import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260913194046_final_customer_auth_identity_foundation_v1.sql"), "utf8");

describe("Final Customer account migration", () => {
  it("creates one account link to auth and Shared Customer Identity without a new customer master", () => {
    expect(sql).toContain("create table public.customer_accounts");
    expect(sql).toContain("references auth.users(id)");
    expect(sql).toContain("references public.customer_identities(id)");
    expect(sql).not.toContain("create table public.final_customers");
  });

  it("forces RLS and limits browser access to auth.uid()", () => {
    for (const table of ["customer_accounts", "customer_account_events", "customer_auth_sms_rate_buckets"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
    }
    expect(sql).toContain("using ((select auth.uid()) = auth_user_id)");
    expect(sql).not.toMatch(/grant select on table public\.customer_account_events to authenticated/i);
    expect(sql).not.toMatch(/grant select on table public\.customer_auth_sms_rate_buckets to authenticated/i);
  });

  it("stores only a keyed phone hash for bounded SMS abuse protection", () => {
    expect(sql).toContain("phone_key_hash text not null");
    expect(sql).not.toMatch(/\botp\s+(text|jsonb|varchar)|message_body|recipient_phone/i);
    expect(sql).toContain("p_limit integer default 5");
    expect(sql).toContain("p_window_minutes integer default 10");
  });
});
