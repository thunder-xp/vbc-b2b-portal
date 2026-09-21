import { describe, expect, it } from "vitest";

import { classifyPostSignInContinuation, safeRelativeAuthRedirect } from "../redirects";

describe("auth redirect boundary", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", ""])("rejects %s", (value) => {
    expect(safeRelativeAuthRedirect(value)).toBeNull();
  });

  it.each(["/cabinet", "/agent", "/admin", "/auth/invitations/abcdefghijklmnopqrstuvwxyz"])("accepts bounded same-origin path %s", (value) => {
    expect(safeRelativeAuthRedirect(value)).toBe(value);
  });
});

describe("post-sign-in continuation classification", () => {
  it("discards sticky access-state and unknown auth routes", () => {
    expect(classifyPostSignInContinuation("/auth/business-access-state")).toEqual({ kind: "DISCARD" });
    expect(classifyPostSignInContinuation("/auth/sign-in?next=/agent")).toEqual({ kind: "DISCARD" });
  });

  it("classifies governed invitation and onboarding continuations", () => {
    expect(classifyPostSignInContinuation("/auth/internal-invitation")).toEqual({
      kind: "INTERNAL_INVITATION", path: "/auth/internal-invitation",
    });
    expect(classifyPostSignInContinuation("/auth/invitations/abcdefghijklmnopqrstuvwxyz")).toEqual({
      kind: "COMPANY_INVITATION",
      path: "/auth/invitations/abcdefghijklmnopqrstuvwxyz",
      token: "abcdefghijklmnopqrstuvwxyz",
    });
    expect(classifyPostSignInContinuation("/become-partner/agent?lang=ro")).toEqual({
      kind: "GOVERNED_ONBOARDING", path: "/become-partner/agent?lang=ro",
    });
    expect(classifyPostSignInContinuation("/onboarding/profile?lang=ru")).toEqual({
      kind: "GOVERNED_ONBOARDING", path: "/onboarding/profile?lang=ru",
    });
  });

  it.each([
    ["/admin/users", "ADMIN"],
    ["/cabinet/orders", "PARTNER"],
    ["/agent/referrals", "AGENT"],
  ] as const)("classifies workspace path %s as %s", (path, workspace) => {
    expect(classifyPostSignInContinuation(path)).toEqual({ kind: "WORKSPACE", path, workspace });
  });
});
