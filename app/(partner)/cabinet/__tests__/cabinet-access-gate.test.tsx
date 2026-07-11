import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPartnerWorkspaceContextAction: vi.fn(),
  redirect: vi.fn((href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/modules/partner-cabinet/actions", () => ({
  getPartnerWorkspaceContextAction: mocks.getPartnerWorkspaceContextAction,
}));
vi.mock("@/src/modules/partner-cabinet/components", () => ({
  PartnerLayout: ({ children }: { children: React.ReactNode }) => <section data-testid="partner-layout">{children}</section>,
  WorkspaceAccessState: ({ state }: { state: string }) => <div>STATE:{state}</div>,
}));

import CabinetLayout from "../layout";

describe("partner workspace access gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPartnerWorkspaceContextAction.mockResolvedValue(successContext("active"));
  });

  it("renders workspace for an approved active partner", async () => {
    render(await CabinetLayout({ children: <div>Workspace content</div> }));
    expect(screen.getByTestId("partner-layout")).toBeInTheDocument();
    expect(screen.getByText("Workspace content")).toBeInTheDocument();
  });

  it("redirects pending and rejected partners to access status", async () => {
    for (const state of ["pending_approval", "rejected"]) {
      mocks.getPartnerWorkspaceContextAction.mockResolvedValue(successContext(state));
      await expect(CabinetLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/onboarding/waiting");
    }
  });

  it("redirects internal users to the internal area", async () => {
    mocks.getPartnerWorkspaceContextAction.mockResolvedValue(successContext("internal"));
    await expect(CabinetLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/admin/partner-requests");
  });

  it("redirects users without a profile to profile onboarding", async () => {
    mocks.getPartnerWorkspaceContextAction.mockResolvedValue(successContext("missing_profile"));
    await expect(CabinetLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/onboarding/profile");
  });

  it.each(["suspended", "missing_membership", "missing_company"])("renders a controlled %s state", async (state) => {
    mocks.getPartnerWorkspaceContextAction.mockResolvedValue(successContext(state));
    render(await CabinetLayout({ children: <div>Hidden content</div> }));
    expect(screen.getByText(`STATE:${state}`)).toBeInTheDocument();
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
  });
});

function successContext(accessState: string) {
  return {
    success: true,
    errorCode: null,
    message: "Context loaded.",
    data: {
      userId: "partner-1",
      userDisplayName: "Partner User",
      userEmail: "partner@example.com",
      accessState,
      companyId: accessState === "active" ? "company-1" : null,
      companyName: accessState === "active" ? "Partner Company" : null,
      companyStatus: accessState === "active" ? "active" : null,
      membershipId: accessState === "active" ? "membership-1" : null,
      membershipRole: accessState === "active" ? "Владелец компании" : null,
      external1cId: null,
      external1cCode: null,
      external1cContractId: null,
      external1cPriceTypeId: null,
      priceTypeName: null,
      availableModules: [],
    },
  };
}
