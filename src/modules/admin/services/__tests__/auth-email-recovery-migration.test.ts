import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260924161840_governed_auth_email_recovery.sql"), "utf8");

describe("governed auth email recovery migration", () => {
  it("keeps all state and audit access service-only", () => {
    expect(sql).toContain("alter table public.auth_email_recovery_attempts enable row level security");
    expect(sql).toContain("alter table public.auth_email_recovery_audit_events enable row level security");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("current_user <> 'service_role'");
  });

  it("bounds concurrent and repeated attempts", () => {
    expect(sql).toContain("auth_email_recovery_attempts_open_user_idx");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("recent_attempts >= 3");
    expect(sql).toContain("ALREADY_DELIVERED");
  });

  it("keeps the audit append-only and excludes all secret link material", () => {
    expect(sql).toContain("auth_email_recovery_audit_events_immutable");
    expect(sql).not.toMatch(/action_link|token_hash|hashed_token|service_role_key/i);
    expect(sql).toContain("masked_email");
    expect(sql).toContain("verification_result");
  });
});
