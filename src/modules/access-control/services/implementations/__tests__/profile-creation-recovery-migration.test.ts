import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260922162041_new_partner_profile_creation_recovery.sql",
), "utf8");

describe("new partner profile creation recovery migration", () => {
  it("removes the private-function CHECK privilege trap", () => {
    expect(sql).toContain("check (phone is null or phone ~ '^\\+373[0-9]{8}$')");
    expect(sql).not.toContain("grant execute on function private.normalize_moldova_phone_e164_v1");
  });

  it("moves profile creation behind an authenticated, hardened RPC", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toContain("revoke insert (id, email, full_name, phone, status, user_type)");
    expect(sql).toContain("grant execute on function public.create_own_user_profile_v1");
  });

  it("serializes retries and fails closed on phone ownership", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("PHONE_ALREADY_IN_USE");
    expect(sql).toContain("ONBOARDING_STATE_CONFLICT");
    expect(sql).toContain("PROFILE_CREATE_RECOVERED");
    expect(sql).toContain("on conflict (auth_user_id, correlation_id) do nothing");
  });
});
