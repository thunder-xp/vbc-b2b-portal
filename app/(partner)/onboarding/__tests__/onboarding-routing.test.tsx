import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  AccessRequestStatus,
  MembershipStatus,
  UserStatus,
} from "@/src/modules/access-control/types";

const mocks = vi.hoisted(() => ({
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

vi.mock("@/src/modules/access-control/actions/current-profile.action", () => ({
  getCurrentProfileAction: mocks.getCurrentProfileAction,
}));

vi.mock("@/src/modules/access-control/actions/get-access-requests.action", () => ({
  getOwnAccessRequestsAction: mocks.getOwnAccessRequestsAction,
}));

vi.mock("@/src/modules/access-control/actions/get-memberships.action", () => ({
  getOwnMembershipsAction: mocks.getOwnMembershipsAction,
}));

vi.mock("@/src/modules/access-control/components/onboarding", () => ({
  AccessRequestForm: () => <section data-testid="access-request-form" />,
  AccessRequestStatusList: () => <section data-testid="access-request-status-list" />,
  OnboardingStateCard: ({ title }: { title: string }) => (
    <section data-testid={`state-card-${title}`} />
  ),
  ProfileForm: () => null,
}));

import OnboardingAccessRequestPage from "../access-request/page";
import OnboardingPage from "../page";
import OnboardingProfilePage from "../profile/page";
import OnboardingWaitingPage from "../waiting/page";

describe("onboarding route decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentProfileAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Current profile loaded.",
      data: makeProfile(),
    });
    mocks.getOwnAccessRequestsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access requests loaded.",
      data: [],
    });
    mocks.getOwnMembershipsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Memberships loaded.",
      data: [],
    });
  });

  it("redirects an existing profile away from profile step", async () => {
    await expect(OnboardingProfilePage()).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/access-request",
    );
  });

  it("redirects duplicate pending review request to waiting state", async () => {
    mocks.getOwnAccessRequestsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access requests loaded.",
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

    await expect(OnboardingAccessRequestPage()).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/waiting",
    );
  });

  it("renders request form only when no pending request exists", async () => {
    const page = await OnboardingAccessRequestPage();

    render(page);

    expect(screen.getByTestId("access-request-form")).toBeInTheDocument();
    expect(screen.queryByTestId("state-card-Waiting for approval")).not.toBeInTheDocument();
  });

  it("redirects approved partner with active membership from waiting to cabinet", async () => {
    mocks.getOwnMembershipsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Memberships loaded.",
      data: [
        {
          id: "membership-1",
          companyId: "company-1",
          roleId: "role-1",
          status: MembershipStatus.Active,
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
        },
      ],
    });
    mocks.getOwnAccessRequestsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access requests loaded.",
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

    await expect(OnboardingWaitingPage()).rejects.toThrow(
      "NEXT_REDIRECT:/cabinet",
    );
  });

  it("does not expose cabinet when active membership exists without approved request", async () => {
    mocks.getOwnMembershipsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Memberships loaded.",
      data: [
        {
          id: "membership-1",
          companyId: "company-1",
          roleId: "role-1",
          status: MembershipStatus.Active,
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
        },
      ],
    });
    mocks.getOwnAccessRequestsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access requests loaded.",
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

    const page = await OnboardingWaitingPage();

    render(page);

    expect(screen.getByTestId("state-card-Waiting for approval")).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalledWith("/cabinet");
  });

  it("onboarding entry requires approved request plus active membership for cabinet", async () => {
    mocks.getOwnMembershipsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Memberships loaded.",
      data: [
        {
          id: "membership-1",
          companyId: "company-1",
          roleId: "role-1",
          status: MembershipStatus.Active,
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
        },
      ],
    });
    mocks.getOwnAccessRequestsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access requests loaded.",
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

    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT:/cabinet");
  });

  it("renders rejected request state", async () => {
    mocks.getOwnAccessRequestsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access requests loaded.",
      data: [
        {
          id: "request-1",
          companyId: null,
          requestedCompanyName: "Partner Company",
          requestedFiscalCode: "BG123456789",
          contactPhone: "+359 1 234",
          message: null,
          status: AccessRequestStatus.Rejected,
          decisionReason: "Company data did not match.",
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
        },
      ],
    });

    const page = await OnboardingWaitingPage();

    render(page);

    expect(screen.getByTestId("state-card-Request rejected")).toBeInTheDocument();
    expect(screen.queryByTestId("state-card-Waiting for approval")).not.toBeInTheDocument();
  });
});

function makeProfile() {
  return {
    id: "user-1",
    email: "partner@example.com",
    fullName: "Partner User",
    phone: "+359 1 234",
    status: UserStatus.Registered,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}
