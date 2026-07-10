import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  AccessRequestStatus,
  MembershipStatus,
  UserStatus,
} from "@/src/modules/access-control/types";

const mocks = vi.hoisted(() => ({
  getActiveCompanyContextAction: vi.fn(),
  getCurrentProfileAction: vi.fn(),
  getOwnAccessRequestsAction: vi.fn(),
  getOwnMembershipsAction: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock(
  "@/src/modules/access-control/actions/get-active-company-context.action",
  () => ({
    getActiveCompanyContextAction: mocks.getActiveCompanyContextAction,
  }),
);

vi.mock("@/src/modules/access-control/actions/current-profile.action", () => ({
  getCurrentProfileAction: mocks.getCurrentProfileAction,
}));

vi.mock("@/src/modules/access-control/actions/get-access-requests.action", () => ({
  getOwnAccessRequestsAction: mocks.getOwnAccessRequestsAction,
}));

vi.mock("@/src/modules/access-control/actions/get-memberships.action", () => ({
  getOwnMembershipsAction: mocks.getOwnMembershipsAction,
}));

vi.mock("@/src/modules/partner-cabinet/components", () => ({
  PartnerLayout: ({ children }: { children: React.ReactNode }) => (
    <section data-testid="partner-layout">{children}</section>
  ),
}));

import CabinetLayout from "../layout";

describe("cabinet access gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentProfileAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Current profile loaded.",
      data: {
        id: "partner-1",
        email: "partner@example.com",
        fullName: "Partner User",
        phone: null,
        status: UserStatus.Active,
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:00:00.000Z",
      },
    });
    mocks.getOwnMembershipsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Memberships loaded.",
      data: [makeActiveMembership()],
    });
    mocks.getOwnAccessRequestsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Requests loaded.",
      data: [],
    });
    mocks.getActiveCompanyContextAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Company loaded.",
      data: null,
    });
  });

  it("redirects active membership without approved request away from cabinet", async () => {
    mocks.getOwnAccessRequestsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Requests loaded.",
      data: [
        {
          id: "request-1",
          companyId: null,
          requestedCompanyName: "Partner Company",
          requestedFiscalCode: "BG123456789",
          contactPhone: "+359 1 234",
          message: null,
          status: AccessRequestStatus.PendingReview,
          decisionReason: null,
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
        },
      ],
    });

    await expect(
      CabinetLayout({ children: <div>Cabinet</div> }),
    ).rejects.toThrow("NEXT_REDIRECT:/onboarding/waiting");
  });

  it("renders cabinet only with active membership and approved request", async () => {
    mocks.getOwnAccessRequestsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Requests loaded.",
      data: [
        {
          id: "request-1",
          companyId: "company-1",
          requestedCompanyName: "Partner Company",
          requestedFiscalCode: "BG123456789",
          contactPhone: "+359 1 234",
          message: null,
          status: AccessRequestStatus.Approved,
          decisionReason: null,
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
        },
      ],
    });

    const page = await CabinetLayout({ children: <div>Cabinet</div> });

    render(page);

    expect(screen.getByTestId("partner-layout")).toBeInTheDocument();
    expect(screen.getByText("Cabinet")).toBeInTheDocument();
  });
});

function makeActiveMembership() {
  return {
    id: "membership-1",
    companyId: "company-1",
    roleId: "role-1",
    status: MembershipStatus.Active,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}
