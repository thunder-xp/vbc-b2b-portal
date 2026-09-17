import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260917192937_internal_user_finance_operator_provisioning_v1.sql"),
  "utf8",
).toLowerCase();

describe("internal finance operator provisioning migration", () => {
  it("keeps the existing finance role and single-role authority", () => {
    expect(sql).toContain("role.code = 'novotech_finance'");
    expect(sql).toContain("insert into public.internal_user_role_assignments");
    expect(sql).not.toContain("insert into public.roles");
    expect(sql).not.toContain("insert into public.role_permissions");
  });

  it("activates only the exact verified invited Auth identity", () => {
    expect(sql).toContain("request.target_auth_user_id = actor_id");
    expect(sql).toContain("email_confirmed_at is null");
    expect(sql).toContain("target_request.normalized_email <> actor_email");
    expect(sql).toContain("values (actor_id, actor_email, target_request.display_name, 'active', 'internal')");
  });

  it("keeps invitation, activation, and role assignment durable and audited", () => {
    for (const event of ["'requested'", "'invite_sent'", "'activated'", "'assigned'"]) {
      expect(sql).toContain(event);
    }
    expect(sql).toContain("internal user provisioning audit is append-only");
    expect(sql).toContain("created_assignment.id, actor_id, finance_role.id");
  });

  it("exposes mutations only through authenticated guarded RPCs", () => {
    expect(sql).toContain("public.has_internal_permission('admin.permissions.manage')");
    expect(sql).toContain("revoke all on table public.internal_user_provisioning_requests from public, anon, authenticated");
    expect(sql).toContain("revoke all on table public.internal_user_provisioning_audit_events from public, anon, authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)\s+on table public\.internal_user_provisioning/i);
    expect(sql).not.toMatch(/grant execute on function public\.begin_finance_operator_provisioning[^;]+to anon/);
  });
});
