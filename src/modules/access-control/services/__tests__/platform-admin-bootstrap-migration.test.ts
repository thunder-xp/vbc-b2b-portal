import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726160000_platform_admin_bootstrap_and_protection.sql",
  ),
  "utf8",
);

describe("platform administrator bootstrap migration", () => {
  it("allows only service-role exact-identity bootstrap", () => {
    expect(migration).toContain("function public.bootstrap_platform_admin");
    expect(migration).toContain("auth.jwt() ->> 'role'");
    expect(migration).toContain("<> 'service_role'");
    expect(migration).toContain("auth_user.email_confirmed_at is not null");
    expect(migration).toContain(
      "'BOOTSTRAP NOVOTECH ADMIN ' || p_user_id::text || ' ' || normalized_email",
    );
    expect(migration).toContain(
      "grant execute on function public.bootstrap_platform_admin(uuid, text, text)",
    );
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(
      /grant execute on function public\.bootstrap_platform_admin[\s\S]{0,100}to authenticated/i,
    );
  });

  it("requires an active internal profile and verified matching identity", () => {
    expect(migration).toContain("target_profile.status <> 'active'");
    expect(migration).toContain(
      "target_profile.user_type not in ('internal', 'admin')",
    );
    expect(migration).toContain(
      "lower(coalesce(target_profile.email, '')) <> normalized_email",
    );
    expect(migration).toContain("lower(auth_user.email) = normalized_email");
  });

  it("is idempotent for the same admin but blocks another bootstrap", () => {
    expect(migration).toContain("if existing_admin_count > 0 then");
    expect(migration).toContain("return existing_assignment.id");
    expect(migration).toContain(
      "raise exception 'A platform administrator already exists.'",
    );
    expect(migration).toContain(
      "raise exception 'The target user already has an active internal role.'",
    );
  });

  it("creates an auditable assignment without exposing a token", () => {
    expect(migration).toContain(
      "'Controlled first platform administrator bootstrap.'",
    );
    expect(migration).toContain(
      "insert into public.internal_role_assignment_audit_events",
    );
    expect(migration).not.toMatch(/bootstrap_token|bootstrap_secret/i);
  });

  it("transactionally protects the final active platform administrator", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("protect_last_platform_admin_assignment");
    expect(migration).toContain("protect_last_platform_admin_profile");
    expect(migration).toContain(
      "The final active platform administrator cannot be revoked.",
    );
    expect(migration).toContain(
      "The final active platform administrator cannot be suspended.",
    );
  });

  it("provides an audited permission-gated revocation RPC", () => {
    expect(migration).toContain("function public.revoke_internal_user_role");
    expect(migration).toContain(
      "public.has_internal_permission('admin.permissions.manage')",
    );
    expect(migration).toContain(
      "insert into public.internal_role_assignment_audit_events",
    );
    expect(migration).not.toMatch(
      /grant\s+(update|delete)\s+on\s+table\s+public\.internal_user_role_assignments\s+to\s+authenticated/i,
    );
  });
});
