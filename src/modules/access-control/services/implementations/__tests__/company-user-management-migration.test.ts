import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260726100000_company_user_management.sql"),
  "utf8",
);

describe("company user management migration", () => {
  it("extends the existing invitation table without storing plaintext tokens", () => {
    expect(sql).toContain("alter table public.invitations");
    expect(sql).not.toContain("create table if not exists public.company_invitations");
    expect(sql).toContain("token_hash text null");
    expect(sql).toContain("token_hash ~ '^[0-9a-f]{64}$'");
    expect(sql).not.toMatch(/\btoken_plaintext\b/i);
  });

  it("keeps one pending invitation and normalized intended overrides", () => {
    expect(sql).toContain("invitations_one_pending_company_email_idx");
    expect(sql).toContain("where status = 'pending'");
    expect(sql).toContain("create table if not exists public.invitation_permission_overrides");
    expect(sql).toContain("pricing.partner_price.view");
    expect(sql).toContain("pricing.retail_price.view");
  });

  it("accepts an invitation as one locked transaction", () => {
    expect(sql).toContain("function public.accept_company_invitation");
    expect(sql).toContain("for update");
    expect(sql).toContain("user_record.email_confirmed_at is not null");
    expect(sql).toContain("lower(target.email) <> actor_email");
    expect(sql).toContain("invitations_token_hash_unique_idx");
    expect(sql).toContain("'invitation_accepted'");
  });

  it("enforces final-owner protection in database transitions", () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(target.company_id::text, 0))");
    expect(sql).toContain("The final active owner cannot be suspended.");
    expect(sql).toContain("The final active owner cannot be downgraded.");
  });

  it("denies direct writes and exposes only narrow RPCs", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.invitation_permission_overrides from anon, authenticated");
    expect(sql).toContain("revoke all on table public.company_user_events from anon, authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all).*company_user_events.*authenticated/i);
    expect(sql).toContain("grant execute on function public.create_company_invitation");
  });

  it("uses one aggregate list function with canonical authorization", () => {
    expect(sql).toContain("function public.list_company_users");
    expect(sql).toContain("public.can_manage_company_users(p_company_id)");
    expect(sql).toContain("count(*) over()");
  });
});
