import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  internal: vi.fn(), business: vi.fn(), application: vi.fn(), decide: vi.fn(),
}));

vi.mock("@/src/modules/admin/services", () => ({ resolveInternalPostSignInDestination: mocks.internal }));
vi.mock("@/src/modules/agent-application", () => ({
  createCommercialAgentApplicationService: () => ({ getApplicantApplication: mocks.application }),
}));
vi.mock("../access-context", () => ({
  createBusinessAccessResolver: () => ({ resolve: mocks.business }),
  decidePostSignInBusinessRoute: mocks.decide,
}));

import { resolveAuthorizedPostSignInTarget, resolvePostSignInAccess } from "../post-sign-in-routing";

const availableAgent = {
  type: "AGENT", contextId: "agent-1", displayName: "Agent", status: "AVAILABLE", targetRoute: "/agent",
} as const;
const pendingAgent = { ...availableAgent, status: "PENDING" } as const;
const availablePartner = {
  type: "PARTNER", contextId: "partner-1", displayName: "Partner", status: "AVAILABLE", targetRoute: "/cabinet",
} as const;

describe("persistent post-sign-in access routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.internal.mockResolvedValue(null);
    mocks.business.mockResolvedValue({ contexts: [], preferredContext: null });
    mocks.decide.mockReturnValue({ kind: "ACCESS_STATE", targetRoute: "/auth/business-access-state" });
    mocks.application.mockResolvedValue(null);
  });

  it("keeps internal access first", async () => {
    mocks.internal.mockResolvedValue("/admin");
    await expect(resolvePostSignInAccess("user-1", {})).resolves.toEqual({
      kind: "INTERNAL", targetRoute: "/admin", requiresBusinessPhoneEnrollment: false,
    });
    expect(mocks.business).not.toHaveBeenCalled();
  });

  it("keeps an available Partner or Agent workspace authoritative", async () => {
    mocks.business.mockResolvedValue({ contexts: [availableAgent], preferredContext: null });
    mocks.decide.mockReturnValue({ kind: "ROUTE", targetRoute: "/agent" });
    await expect(resolvePostSignInAccess("user-1", { registration_intent: "installer" })).resolves.toEqual({
      kind: "PARTNER_OR_AGENT_WORKSPACE", targetRoute: "/agent", requiresBusinessPhoneEnrollment: true,
    });
    expect(mocks.application).not.toHaveBeenCalled();
  });

  it.each(["APPLIED", "COMPLIANCE_REVIEW", "CONTRACT_PENDING", "APPROVED", "TRAINING"])(
    "routes a pending %s Agent context to its status-only cabinet",
    async () => {
      mocks.business.mockResolvedValue({ contexts: [pendingAgent], preferredContext: null });
      mocks.decide.mockReturnValue({ kind: "ROUTE", targetRoute: "/agent" });
      await expect(resolvePostSignInAccess("user-1", {})).resolves.toEqual({
        kind: "PARTNER_OR_AGENT_WORKSPACE", targetRoute: "/agent", requiresBusinessPhoneEnrollment: false,
      });
      expect(mocks.application).not.toHaveBeenCalled();
    },
  );

  it("fails an unavailable internal lookup closed but still resolves external access", async () => {
    mocks.internal.mockRejectedValue(new Error("internal registry unavailable"));
    mocks.business.mockResolvedValue({ contexts: [availablePartner], preferredContext: null });
    mocks.decide.mockReturnValue({ kind: "ROUTE", targetRoute: "/cabinet" });
    await expect(resolvePostSignInAccess("user-1", {})).resolves.toEqual({
      kind: "PARTNER_OR_AGENT_WORKSPACE", targetRoute: "/cabinet", requiresBusinessPhoneEnrollment: true,
    });
  });

  it.each(["DRAFT", "SUBMITTED", "NEEDS_CLARIFICATION", "APPROVED"])(
    "routes a persisted %s application back to Agent onboarding",
    async (status) => {
      mocks.application.mockResolvedValue({ status });
      await expect(resolvePostSignInAccess("user-1", { preferred_registration_locale: "ro" })).resolves.toEqual({
        kind: "AGENT_APPLICATION", targetRoute: "/become-partner/agent?lang=ro", requiresBusinessPhoneEnrollment: false,
      });
    },
  );

  it("uses registration intent only as a navigation hint before the first Agent draft", async () => {
    await expect(resolvePostSignInAccess("user-1", { registration_intent: "agent", preferred_registration_locale: "ru" })).resolves.toEqual({
      kind: "AGENT_APPLICATION", targetRoute: "/become-partner/agent?lang=ru", requiresBusinessPhoneEnrollment: false,
    });
  });

  it("does not let a metadata hint override a terminal application state", async () => {
    mocks.application.mockResolvedValue({ status: "REJECTED" });
    await expect(resolvePostSignInAccess("user-1", { registration_intent: "agent" })).resolves.toEqual({
      kind: "NONE", targetRoute: "/auth/business-access-state", requiresBusinessPhoneEnrollment: false,
    });
  });

  it("routes Installer intent to the existing governed onboarding", async () => {
    await expect(resolvePostSignInAccess("user-1", { registration_intent: "installer", preferred_registration_locale: "ro" })).resolves.toEqual({
      kind: "PARTNER_ONBOARDING", targetRoute: "/onboarding/profile?lang=ro", requiresBusinessPhoneEnrollment: false,
    });
  });

  it("keeps a genuinely unknown user on business access state", async () => {
    await expect(resolvePostSignInAccess("user-1", {})).resolves.toEqual({
      kind: "NONE", targetRoute: "/auth/business-access-state", requiresBusinessPhoneEnrollment: false,
    });
  });

  it("allows a workspace continuation only when it matches resolved authority", () => {
    const agentDecision = {
      kind: "PARTNER_OR_AGENT_WORKSPACE", targetRoute: "/agent", requiresBusinessPhoneEnrollment: true,
    } as const;
    expect(resolveAuthorizedPostSignInTarget(agentDecision, {
      kind: "WORKSPACE", path: "/agent/referrals", workspace: "AGENT",
    })).toBe("/agent/referrals");
    expect(resolveAuthorizedPostSignInTarget(agentDecision, {
      kind: "WORKSPACE", path: "/cabinet/orders", workspace: "PARTNER",
    })).toBe("/agent");
  });

  it("does not let next=/agent authorize an unrelated user", () => {
    const noWorkspace = {
      kind: "NONE", targetRoute: "/auth/business-access-state", requiresBusinessPhoneEnrollment: false,
    } as const;
    expect(resolveAuthorizedPostSignInTarget(noWorkspace, {
      kind: "WORKSPACE", path: "/agent", workspace: "AGENT",
    })).toBe("/auth/business-access-state");
  });

  it("recomputes authority when access-state is supplied as next", () => {
    const pending = {
      kind: "PARTNER_OR_AGENT_WORKSPACE", targetRoute: "/agent", requiresBusinessPhoneEnrollment: false,
    } as const;
    expect(resolveAuthorizedPostSignInTarget(pending, { kind: "DISCARD" })).toBe("/agent");
  });
});
