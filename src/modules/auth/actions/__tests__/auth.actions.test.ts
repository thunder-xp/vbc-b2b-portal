import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  signInWithPassword: vi.fn(),
  getCurrentProfile: vi.fn(),
  acceptInvitation: vi.fn(),
  activateCurrent: vi.fn(),
  resolveInternalDestination: vi.fn(),
  resolveBusinessAccess: vi.fn(),
  decideBusinessRoute: vi.fn(),
  isBusinessPhoneOtpEnabled: vi.fn(),
  setPartnerLocaleCookie: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithPassword: mocks.signInWithPassword },
  })),
}));
vi.mock("@/src/modules/access-control/actions/service-factory", () => ({
  createCompanyUserManagementService: vi.fn(() => ({
    acceptInvitation: mocks.acceptInvitation,
  })),
  createUserProfileService: vi.fn(() => ({
    getCurrentProfile: mocks.getCurrentProfile,
  })),
}));
vi.mock("@/src/modules/admin/services", () => ({
  createAdminInternalUserProvisioningService: vi.fn(() => ({
    activateCurrent: mocks.activateCurrent,
  })),
  resolveInternalPostSignInDestination: mocks.resolveInternalDestination,
}));
vi.mock("@/src/modules/partner-locale", () => ({
  isPartnerLocale: vi.fn((value: unknown) => value === "ru" || value === "ro"),
}));
vi.mock("@/src/modules/partner-locale/server", () => ({
  setPartnerLocaleCookie: mocks.setPartnerLocaleCookie,
}));
vi.mock("@/src/modules/quick-auth/factory", () => ({
  isBusinessPhoneOtpEnabled: mocks.isBusinessPhoneOtpEnabled,
}));
vi.mock("@/src/modules/auth/access-context", () => ({
  createBusinessAccessResolver: vi.fn(() => ({
    resolve: mocks.resolveBusinessAccess,
  })),
  decideBusinessRoute: mocks.decideBusinessRoute,
  isUnifiedBusinessRoutingEnabled: vi.fn(() => true),
}));

import { signInAction } from "../auth.actions";

const REDIRECT_PREFIX = "NEXT_REDIRECT:";

function credentials(next?: string): FormData {
  const formData = new FormData();
  formData.set("email", "user@example.com");
  formData.set("password", "password");
  formData.set("lang", "ru");
  if (next) formData.set("next", next);
  return formData;
}

async function expectRedirect(next: string | undefined, expected: string) {
  await expect(signInAction({ error: null }, credentials(next))).rejects.toThrow(
    `${REDIRECT_PREFIX}${expected}`,
  );
}

describe("classic password sign-in routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`${REDIRECT_PREFIX}${destination}`);
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          phone: "+37360000000",
          phone_confirmed_at: "2026-09-20T00:00:00.000Z",
        },
      },
      error: null,
    });
    mocks.getCurrentProfile.mockResolvedValue(null);
    mocks.resolveInternalDestination.mockResolvedValue(null);
    mocks.resolveBusinessAccess.mockResolvedValue({ contexts: [] });
    mocks.decideBusinessRoute.mockReturnValue({
      kind: "ACCESS_STATE",
      targetRoute: "/auth/business-access-state",
    });
    mocks.isBusinessPhoneOtpEnabled.mockReturnValue(true);
  });

  it.each(["novotech_admin", "novotech_finance"])(
    "routes an active %s identity to Admin before business resolution",
    async () => {
      mocks.resolveInternalDestination.mockResolvedValue("/admin");
      mocks.signInWithPassword.mockResolvedValue({
        data: { user: { id: "user-1", phone: null, phone_confirmed_at: null } },
        error: null,
      });

      await expectRedirect(undefined, "/admin");

      expect(mocks.resolveInternalDestination).toHaveBeenCalledWith("user-1");
      expect(mocks.resolveBusinessAccess).not.toHaveBeenCalled();
      expect(mocks.isBusinessPhoneOtpEnabled).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["Partner", "/cabinet"],
    ["Agent", "/agent"],
    ["Partner + Agent ambiguity", "/auth/select-context"],
    ["no workspace", "/auth/business-access-state"],
  ])("preserves %s routing to %s", async (_case, targetRoute) => {
    mocks.decideBusinessRoute.mockReturnValue({ kind: "ROUTE", targetRoute });

    await expectRedirect(undefined, targetRoute);

    expect(
      mocks.resolveInternalDestination.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.resolveBusinessAccess.mock.invocationCallOrder[0] ?? 0);
  });

  it("fails internal lookup closed without preventing legitimate business resolution", async () => {
    mocks.resolveInternalDestination.mockRejectedValue(new Error("RPC unavailable"));
    mocks.decideBusinessRoute.mockReturnValue({
      kind: "ROUTE",
      targetRoute: "/cabinet",
    });

    await expectRedirect(undefined, "/cabinet");
    expect(mocks.resolveBusinessAccess).toHaveBeenCalledWith("user-1");
  });

  it("preserves an explicit safe Admin next path without resolving or granting a role", async () => {
    await expectRedirect("/admin/finance", "/admin/finance");

    expect(mocks.resolveInternalDestination).not.toHaveBeenCalled();
    expect(mocks.resolveBusinessAccess).not.toHaveBeenCalled();
  });

  it("preserves internal invitation activation before automatic landing", async () => {
    await expectRedirect("/auth/internal-invitation", "/admin");

    expect(mocks.activateCurrent).toHaveBeenCalledOnce();
    expect(mocks.resolveInternalDestination).not.toHaveBeenCalled();
  });

  it("preserves company invitation acceptance before automatic landing", async () => {
    const invitationPath = "/auth/invitations/abcdefghijklmnopqrst";
    await expectRedirect(invitationPath, "/cabinet");

    expect(mocks.acceptInvitation).toHaveBeenCalledWith("abcdefghijklmnopqrst");
    expect(mocks.resolveInternalDestination).not.toHaveBeenCalled();
  });

  it("preserves governed professional onboarding continuation", async () => {
    const onboardingPath = "/become-partner/agent?step=profile";
    await expectRedirect(onboardingPath, onboardingPath);

    expect(mocks.resolveInternalDestination).not.toHaveBeenCalled();
    expect(mocks.resolveBusinessAccess).not.toHaveBeenCalled();
  });

  it("keeps wrong-password behavior unchanged", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new Error("invalid credentials"),
    });

    await expect(signInAction({ error: null }, credentials())).resolves.toEqual({
      error: "Email or password is incorrect.",
    });
    expect(mocks.resolveInternalDestination).not.toHaveBeenCalled();
    expect(mocks.resolveBusinessAccess).not.toHaveBeenCalled();
  });
});
