import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const provider = readFileSync(
  join(process.cwd(), "src/modules/admin/services/internal-user-invitation.provider.ts"),
  "utf8",
);
const confirmationRoute = readFileSync(
  join(process.cwd(), "app/auth/internal-invitation/confirm/route.ts"),
  "utf8",
);
const component = readFileSync(
  join(process.cwd(), "src/modules/auth/components/InternalInvitationActivationForm.tsx"),
  "utf8",
);
const activationActions = readFileSync(
  join(process.cwd(), "src/modules/auth/actions/internal-invitation.actions.ts"),
  "utf8",
);
const authActions = readFileSync(
  join(process.cwd(), "src/modules/auth/actions/auth.actions.ts"),
  "utf8",
);
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260917200347_internal_invite_activation_flow_fix_v1.sql"),
  "utf8",
).toLowerCase();

describe("internal invitation activation contract", () => {
  it("preserves the known allow-listed activation redirect and supports bounded SSR confirmation", () => {
    expect(provider).toContain('new URL("/auth/internal-invitation", origin)');
    expect(confirmationRoute).toContain("verifyOtp({ token_hash: tokenHash, type })");
    expect(confirmationRoute).toContain("exchangeCodeForSession(code)");
    expect(confirmationRoute).not.toMatch(/console\.(?:log|error|warn)/);
  });

  it("supports all terminal UI states and removes implicit tokens from the address bar", () => {
    for (const state of [
      "VERIFYING",
      "READY",
      "INVALID_INVITE",
      "EXPIRED_INVITE",
      "ALREADY_USED",
      "ACTIVATING",
      "COMPLETED",
      "ERROR",
    ]) {
      expect(component).toContain(state);
    }
    expect(component).toContain("window.history.replaceState");
    expect(component).toContain("supabase.auth.setSession");
    expect(component).not.toMatch(/console\.(?:log|error|warn)/);
  });

  it("keeps password setup and governed role activation in one SSR action", () => {
    const updatePosition = activationActions.indexOf("supabase.auth.updateUser({ password })");
    const activationPosition = activationActions.indexOf("service.activateCurrent()");
    expect(updatePosition).toBeGreaterThan(0);
    expect(activationPosition).toBeGreaterThan(updatePosition);
    expect(component).not.toContain("supabase.auth.updateUser");
  });

  it("can resume a password-saved invitation only after normal password authentication", () => {
    expect(authActions).toContain('nextPath === "/auth/internal-invitation"');
    expect(authActions.indexOf("signInWithPassword")).toBeLessThan(
      authActions.indexOf("createAdminInternalUserProvisioningService().activateCurrent()"),
    );
  });

  it("reissues only the same governed pending identity and audits the event", () => {
    expect(migration).toContain("get_finance_operator_reissue_candidate");
    expect(migration).toContain("mark_finance_operator_invitation_reissued");
    expect(migration).toContain("request.status in ('invited', 'active')");
    expect(migration).toContain("'invite_reissued'");
    expect(migration).toContain("public.has_internal_permission('admin.permissions.manage')");
    expect(migration).not.toContain("insert into public.roles");
    expect(migration).not.toContain("insert into public.role_permissions");
  });
});
