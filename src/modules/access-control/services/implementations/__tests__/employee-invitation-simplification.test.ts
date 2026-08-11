import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260811120000_partner_employee_invitation_simplification.sql"),
  "utf8",
);
const registrationAction = readFileSync(
  join(process.cwd(), "src/modules/auth/actions/invitation-registration.actions.ts"),
  "utf8",
);
const callbackRoute = readFileSync(join(process.cwd(), "app/auth/callback/route.ts"), "utf8");
const grantsMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260811121000_partner_employee_invitation_grants_hardening.sql"),
  "utf8",
);
const acceptanceFixMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260811130000_partner_employee_invitation_acceptance_fix.sql"),
  "utf8",
);

describe("partner employee invitation simplification", () => {
  it("binds public preview to a hashed bearer token and exposes no raw authority inputs", () => {
    expect(migration).toContain("get_company_invitation_preview(p_token_hash text)");
    expect(migration).toContain("invitation.token_hash = p_token_hash");
    expect(migration).toContain("grant execute on function public.get_company_invitation_preview(text) to anon, authenticated");
    expect(migration).not.toMatch(/get_company_invitation_preview\([^)]*company_id/i);
  });

  it("keeps acceptance email-bound, verified, locked, atomic, and idempotent", () => {
    expect(migration).toContain("auth_user.email_confirmed_at is not null");
    expect(migration).toContain("lower(trim(target.email)) <> actor_email");
    expect(migration).toContain("where invitation.token_hash = p_token_hash for update");
    expect(migration).toContain("target.accepted_membership_id is not null");
    expect(migration).toContain("delete from public.membership_permission_overrides");
    expect(migration).toContain("invitation_permission_overrides intended");
    expect(migration).toContain("user_company_context_preferences");
  });

  it("reactivates only through a valid invitation and preserves multi-company memberships", () => {
    expect(migration).toContain("company_membership.company_id = target.company_id");
    expect(migration).toContain("status = 'active'");
    expect(migration).not.toContain("delete from public.company_memberships");
    expect(migration).not.toContain("delete from auth.users");
  });

  it("revokes only the selected membership and protects the last owner", () => {
    expect(migration).toContain("revoke_company_membership_access");
    expect(migration).toContain("The final active owner cannot be revoked.");
    expect(migration).toContain("set status = 'revoked'");
    expect(migration).toContain("employee_access_revoked");
  });

  it("allows anonymous preview but keeps every invitation mutation authenticated", () => {
    expect(grantsMigration).toContain("get_company_invitation_preview(text)\n  to anon, authenticated");
    expect(grantsMigration).toContain("record_company_invitation_email_delivery(uuid, text)\n  to authenticated");
    expect(grantsMigration).toContain("revoke_company_membership_access(uuid, text)\n  to authenticated");
    expect(grantsMigration).toContain("accept_company_invitation(text)\n  to authenticated");
    expect(grantsMigration).not.toMatch(/grant execute on function public\.accept_company_invitation\(text\)[\s\S]{0,30}to anon/);
  });

  it("preserves invitation context through verified signup without generic company onboarding", () => {
    expect(registrationAction).toContain('signup_source: "company_invitation"');
    expect(registrationAction).toContain("emailRedirectTo");
    expect(registrationAction).not.toContain("requested_company_name");
    expect(registrationAction).not.toContain("country");
    expect(callbackRoute).toContain("exchangeCodeForSession");
    expect(callbackRoute).toContain("acceptInvitation");
    expect(callbackRoute).not.toContain("/onboarding/access-request");
  });

  it("qualifies the membership override key in the executed acceptance RPC", () => {
    expect(acceptanceFixMigration).toContain(
      "membership_permission_override.membership_id = membership.id",
    );
    expect(acceptanceFixMigration).not.toMatch(
      /delete from public\.membership_permission_overrides\s+where membership_id = membership\.id/,
    );
    expect(acceptanceFixMigration).toContain(
      "grant execute on function public.accept_company_invitation(text) to authenticated",
    );
  });
});
