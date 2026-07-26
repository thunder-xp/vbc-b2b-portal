import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726167000_initial_platform_admin_role_transfer.sql",
  ),
  "utf8",
);

describe("initial platform administrator role transfer migration", () => {
  it("is service-role-only and requires exact identity confirmation", () => {
    expect(migration).toContain("function public.transfer_initial_platform_admin");
    expect(migration).toContain("auth.jwt() ->> 'role'");
    expect(migration).toContain("<> 'service_role'");
    expect(migration).toContain("auth_user.email_confirmed_at is not null");
    expect(migration).toContain("auth_user.deleted_at is null");
    expect(migration).toContain("'TRANSFER NOVOTECH ADMIN '");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(
      /grant execute on function public\.transfer_initial_platform_admin[\s\S]{0,120}to authenticated/i,
    );
  });

  it("atomically replaces only the verified sales assignment", () => {
    expect(migration).toContain("public.lock_platform_admin_transition()");
    expect(migration).toContain("for update");
    expect(migration).toContain("active_assignment_count <> 1");
    expect(migration).toContain(
      "active_assignment.id <> p_expected_sales_assignment_id",
    );
    expect(migration).toContain("active_assignment.role_id <> sales_role.id");
    expect(migration).toContain("set revoked_at = now()");
    expect(migration).toContain("admin_role.id");
  });

  it("records one transfer event with both roles and supports exact retries", () => {
    expect(migration).toContain("'transferred'");
    expect(migration).toContain("previous_role_id");
    expect(migration).toContain(
      "Initial platform administrator role transfer approved by Novotech platform owner.",
    );
    expect(migration).toContain("'idempotent', true");
    expect(migration).toContain("transfer_audit_count = 1");
  });

  it("preserves first-admin and one-active-role invariants", () => {
    expect(migration).toContain("if active_admin_count <> 0 then");
    expect(migration).toContain(
      "raise exception 'A platform administrator already exists.'",
    );
    expect(migration).toContain(
      "Platform administrator transfer invariant failed.",
    );
  });
});
