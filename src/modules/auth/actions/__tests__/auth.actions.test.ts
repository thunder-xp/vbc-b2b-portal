import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), resend: vi.fn(), getCurrentProfile: vi.fn(),
  acceptInvitation: vi.fn(), activateCurrent: vi.fn(), resolvePostSignInAccess: vi.fn(),
  resolveAuthorizedPostSignInTarget: vi.fn(), isBusinessPhoneOtpEnabled: vi.fn(), setPartnerLocaleCookie: vi.fn(),
  resolveRegistrationState: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { signInWithPassword: mocks.signInWithPassword, signUp: mocks.signUp, resend: mocks.resend } })) }));
vi.mock("@/src/modules/auth/partner-registration-state", () => ({
  PartnerRegistrationStateError: class PartnerRegistrationStateError extends Error {},
  resolvePartnerRegistrationIdentityState: mocks.resolveRegistrationState,
}));
vi.mock("@/src/modules/access-control/actions/service-factory", () => ({
  createCompanyUserManagementService: vi.fn(() => ({ acceptInvitation: mocks.acceptInvitation })),
  createUserProfileService: vi.fn(() => ({ getCurrentProfile: mocks.getCurrentProfile })),
}));
vi.mock("@/src/modules/admin/services", () => ({ createAdminInternalUserProvisioningService: vi.fn(() => ({ activateCurrent: mocks.activateCurrent })) }));
vi.mock("@/src/modules/partner-locale", () => ({ isPartnerLocale: vi.fn((value: unknown) => value === "ru" || value === "ro") }));
vi.mock("@/src/modules/partner-locale/server", () => ({ setPartnerLocaleCookie: mocks.setPartnerLocaleCookie }));
vi.mock("@/src/modules/quick-auth/factory", () => ({ isBusinessPhoneOtpEnabled: mocks.isBusinessPhoneOtpEnabled }));
vi.mock("@/src/modules/auth/post-sign-in-routing", () => ({
  resolvePostSignInAccess: mocks.resolvePostSignInAccess,
  resolveAuthorizedPostSignInTarget: mocks.resolveAuthorizedPostSignInTarget,
}));

import { registerAgentAction, registerInstallerAction, resendProfessionalConfirmationAction, signInAction } from "../auth.actions";

const REDIRECT_PREFIX = "NEXT_REDIRECT:";

function credentials(next?: string): FormData {
  const formData = new FormData();
  formData.set("email", "user@example.com"); formData.set("password", "password"); formData.set("lang", "ru");
  if (next) formData.set("next", next);
  return formData;
}

function registration(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  Object.entries({ email: "agent@example.com", password: "password", confirmPassword: "password", intent: "agent", legalForm: "LEGAL_ENTITY", locale: "ro", ...overrides })
    .forEach(([key, value]) => formData.set(key, value));
  return formData;
}

async function expectSignInRedirect(next: string | undefined, expected: string) {
  await expect(signInAction({ error: null }, credentials(next))).rejects.toThrow(`${REDIRECT_PREFIX}${expected}`);
}

describe("classic password sign-in routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((destination: string) => { throw new Error(`${REDIRECT_PREFIX}${destination}`); });
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "user-1", phone: "+37360000000", phone_confirmed_at: "2026-09-20T00:00:00.000Z", user_metadata: {} } }, error: null });
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    mocks.resend.mockResolvedValue({ data: {}, error: null });
    mocks.resolveRegistrationState.mockResolvedValue("MISSING");
    mocks.getCurrentProfile.mockResolvedValue(null);
    mocks.resolvePostSignInAccess.mockResolvedValue({
      kind: "NONE", targetRoute: "/auth/business-access-state", requiresBusinessPhoneEnrollment: false,
    });
    mocks.resolveAuthorizedPostSignInTarget.mockImplementation((decision: { targetRoute: string }) => decision.targetRoute);
    mocks.isBusinessPhoneOtpEnabled.mockReturnValue(true);
  });

  it.each([
    ["Internal", "/admin"], ["Partner", "/cabinet"], ["Agent", "/agent"],
    ["Agent application", "/become-partner/agent?lang=ru"], ["Partner onboarding", "/onboarding/profile?lang=ru"],
    ["no workspace", "/auth/business-access-state"],
  ])("preserves %s routing to %s", async (_case, targetRoute) => {
    mocks.resolvePostSignInAccess.mockResolvedValue({
      kind: "PARTNER_OR_AGENT_WORKSPACE", targetRoute, requiresBusinessPhoneEnrollment: false,
    });
    await expectSignInRedirect(undefined, targetRoute);
    expect(mocks.resolvePostSignInAccess).toHaveBeenCalledWith("user-1", {});
  });

  it("honors an explicitly governed onboarding continuation before automatic resolution", async () => {
    await expectSignInRedirect("/onboarding/profile?lang=ro", "/onboarding/profile?lang=ro");
    expect(mocks.resolvePostSignInAccess).not.toHaveBeenCalled();
  });

  it("discards stale access-state next and recomputes a pending Agent route", async () => {
    mocks.resolvePostSignInAccess.mockResolvedValue({
      kind: "PARTNER_OR_AGENT_WORKSPACE", targetRoute: "/agent", requiresBusinessPhoneEnrollment: false,
    });
    await expectSignInRedirect("/auth/business-access-state", "/agent");
    expect(mocks.resolveAuthorizedPostSignInTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetRoute: "/agent" }),
      { kind: "DISCARD" },
    );
  });

  it("does not send a pending Agent through operational phone enrollment", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1", phone: null, phone_confirmed_at: null, user_metadata: {} } }, error: null,
    });
    mocks.resolvePostSignInAccess.mockResolvedValue({
      kind: "PARTNER_OR_AGENT_WORKSPACE", targetRoute: "/agent", requiresBusinessPhoneEnrollment: false,
    });
    await expectSignInRedirect(undefined, "/agent");
  });

  it.each([["ACTIVE Agent", "/agent"], ["Partner", "/cabinet"]])(
    "preserves %s operational phone enrollment",
    async (_case, targetRoute) => {
      mocks.signInWithPassword.mockResolvedValue({
        data: { user: { id: "user-1", phone: null, phone_confirmed_at: null, user_metadata: {} } }, error: null,
      });
      mocks.resolvePostSignInAccess.mockResolvedValue({
        kind: "PARTNER_OR_AGENT_WORKSPACE", targetRoute, requiresBusinessPhoneEnrollment: true,
      });
      await expectSignInRedirect(
        undefined,
        `/auth/business-phone-enrollment?lang=ru&next=${encodeURIComponent(targetRoute)}`,
      );
    },
  );

  it("does not let next=/agent authorize an unrelated user", async () => {
    mocks.resolveAuthorizedPostSignInTarget.mockReturnValue("/auth/business-access-state");
    await expectSignInRedirect("/agent", "/auth/business-access-state");
    expect(mocks.resolveAuthorizedPostSignInTarget).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "NONE" }),
      { kind: "WORKSPACE", path: "/agent", workspace: "AGENT" },
    );
  });

  it("keeps canonical routing active when the retired production flag is false", async () => {
    vi.stubEnv("UNIFIED_BUSINESS_ROUTING_ENABLED", "false");
    mocks.resolvePostSignInAccess.mockResolvedValue({
      kind: "INTERNAL", targetRoute: "/admin", requiresBusinessPhoneEnrollment: false,
    });
    await expectSignInRedirect(undefined, "/admin");
    expect(mocks.resolvePostSignInAccess).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it("preserves internal invitation activation before explicit continuation", async () => {
    await expectSignInRedirect("/auth/internal-invitation", "/admin");
    expect(mocks.activateCurrent).toHaveBeenCalledOnce();
  });

  it("preserves company invitation acceptance before explicit continuation", async () => {
    const invitationPath = "/auth/invitations/abcdefghijklmnopqrst";
    await expectSignInRedirect(invitationPath, "/cabinet");
    expect(mocks.acceptInvitation).toHaveBeenCalledWith("abcdefghijklmnopqrst");
  });

  it("keeps wrong-password behavior unchanged", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: new Error("invalid credentials") });
    await expect(signInAction({ error: null }, credentials())).resolves.toEqual({ error: "Email or password is incorrect." });
    expect(mocks.resolvePostSignInAccess).not.toHaveBeenCalled();
  });

  it("creates an Agent identity with navigation hints and a governed confirmation redirect", async () => {
    await expect(registerAgentAction({ error: null }, registration({ intent: "installer", next: "/onboarding/profile" }))).rejects.toThrow(`${REDIRECT_PREFIX}/auth/check-email?lang=ro&intent=agent&next=%2Fbecome-partner%2Fagent%3Flang%3Dro`);
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "agent@example.com", password: "password",
      options: {
        emailRedirectTo: "https://www.nsd.md/auth/sign-in?confirmed=1&lang=ro&intent=agent&next=%2Fbecome-partner%2Fagent%3Flang%3Dro",
        data: { registration_intent: "agent", registration_legal_form: "LEGAL_ENTITY", preferred_registration_locale: "ro" },
      },
    });
  });

  it("uses the existing Partner onboarding continuation for Installer registration", async () => {
    await expect(registerInstallerAction({ error: null }, registration({ intent: "agent", next: "/become-partner/agent", legalForm: "INDIVIDUAL", locale: "ru" })))
      .rejects.toThrow(`${REDIRECT_PREFIX}/auth/check-email?lang=ru&intent=installer&next=%2Fonboarding%2Fprofile%3Flang%3Dru`);
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({
      emailRedirectTo: "https://www.nsd.md/auth/sign-in?confirmed=1&lang=ru&intent=installer&next=%2Fonboarding%2Fprofile%3Flang%3Dru",
      data: { registration_intent: "installer", registration_legal_form: "INDIVIDUAL", preferred_registration_locale: "ru" },
    }) }));
  });

  it("does not create a second identity and exposes a governed resend only for an unconfirmed user", async () => {
    mocks.resolveRegistrationState.mockResolvedValue("UNCONFIRMED");
    await expect(registerAgentAction({ error: null }, registration({ email: "admin@psg.md", locale: "ru" })))
      .resolves.toEqual({ error: null, status: "CONFIRMATION_PENDING", email: "admin@psg.md", intent: "agent", locale: "ru" });
    expect(mocks.signUp).not.toHaveBeenCalled();

    const resend = new FormData();
    resend.set("email", "admin@psg.md"); resend.set("intent", "agent"); resend.set("locale", "ru");
    await expect(resendProfessionalConfirmationAction({ error: null }, resend))
      .resolves.toEqual({ error: null, status: "CONFIRMATION_SENT", email: "admin@psg.md", intent: "agent", locale: "ru" });
    expect(mocks.resend).toHaveBeenCalledOnce();
  });

  it("does not offer resend when the identity is missing and maps Auth failures precisely", async () => {
    const resend = new FormData();
    resend.set("email", "missing@example.com"); resend.set("intent", "installer"); resend.set("locale", "ro");
    mocks.resolveRegistrationState.mockResolvedValue("MISSING");
    await expect(resendProfessionalConfirmationAction({ error: null }, resend)).resolves.toEqual({ error: "ACCOUNT_NOT_FOUND" });
    expect(mocks.resend).not.toHaveBeenCalled();

    mocks.resolveRegistrationState.mockResolvedValue("UNCONFIRMED");
    mocks.resend.mockResolvedValue({ data: {}, error: { code: "over_email_send_rate_limit", status: 429 } });
    await expect(resendProfessionalConfirmationAction({ error: null }, resend)).resolves.toEqual({ error: "RATE_LIMIT" });
  });

  it("classifies transient Supabase address validation as temporary instead of permanent invalid email", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: { code: "email_address_invalid", status: 400 } });
    await expect(registerAgentAction({ error: null }, registration({ email: "admin@psg.md" })))
      .resolves.toEqual({ error: "TEMPORARY_EMAIL_VALIDATION" });
  });
});
