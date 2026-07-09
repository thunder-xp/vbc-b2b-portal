import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccessRequestStatus,
  MembershipStatus,
  UserStatus,
  type CompanyMembership,
} from "../../../types";
import type { CurrentProfileDto } from "../../../actions/current-profile.action";
import type { OwnAccessRequestDto } from "../../../actions/get-access-requests.action";
import { AccessRequestForm } from "../AccessRequestForm";
import { AccessRequestStatusList } from "../AccessRequestStatusList";
import { OnboardingStateCard } from "../OnboardingStateCard";
import { ProfileForm } from "../ProfileForm";

const mocks = vi.hoisted(() => ({
  createProfileAction: vi.fn(),
  updateOwnProfileAction: vi.fn(),
  submitAccessRequestAction: vi.fn(),
  cancelOwnAccessRequestAction: vi.fn(),
}));

vi.mock("../../../actions/create-profile.action", () => ({
  createProfileAction: mocks.createProfileAction,
}));

vi.mock("../../../actions/update-profile.action", () => ({
  updateOwnProfileAction: mocks.updateOwnProfileAction,
}));

vi.mock("../../../actions/submit-access-request.action", () => ({
  submitAccessRequestAction: mocks.submitAccessRequestAction,
}));

vi.mock("../../../actions/cancel-access-request.action", () => ({
  cancelOwnAccessRequestAction: mocks.cancelOwnAccessRequestAction,
}));

describe("ProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders fullName and phone fields", () => {
    render(<ProfileForm profile={makeProfile()} />);

    expect(screen.getByLabelText("Full name")).toHaveValue("Partner User");
    expect(screen.getByLabelText("Phone")).toHaveValue("+359 1 234");
  });

  it("creates a missing profile instead of showing an unavailable state", async () => {
    const user = userEvent.setup();
    mocks.createProfileAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Profile created.",
      data: makeProfile({
        fullName: "New Partner",
        phone: "+359 8 888",
      }),
    });
    render(<ProfileForm profile={null} />);

    await user.type(screen.getByLabelText("Full name"), "New Partner");
    await user.type(screen.getByLabelText("Phone"), "+359 8 888");
    await user.click(screen.getByRole("button", { name: "Create profile" }));

    expect(mocks.createProfileAction).toHaveBeenCalledWith({
      fullName: "New Partner",
      phone: "+359 8 888",
    });
    expect(await screen.findByText("Profile created.")).toBeInTheDocument();
  });

  it("submits safe profile fields only", async () => {
    const user = userEvent.setup();
    mocks.updateOwnProfileAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Profile updated.",
      data: makeProfile({
        fullName: "Updated User",
        phone: "+359 9 999",
      }),
    });
    render(<ProfileForm profile={makeProfile()} />);

    await user.clear(screen.getByLabelText("Full name"));
    await user.type(screen.getByLabelText("Full name"), "Updated User");
    await user.clear(screen.getByLabelText("Phone"));
    await user.type(screen.getByLabelText("Phone"), "+359 9 999");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(mocks.updateOwnProfileAction).toHaveBeenCalledWith({
      fullName: "Updated User",
      phone: "+359 9 999",
    });
  });

  it("displays success result", async () => {
    const user = userEvent.setup();
    mocks.updateOwnProfileAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Profile updated.",
      data: makeProfile({
        fullName: "Updated User",
      }),
    });
    render(<ProfileForm profile={makeProfile()} />);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Profile updated.")).toBeInTheDocument();
  });

  it("displays error result", async () => {
    const user = userEvent.setup();
    mocks.updateOwnProfileAction.mockResolvedValue({
      success: false,
      errorCode: "FORBIDDEN",
      message: "This action is not allowed.",
      data: null,
    });
    render(<ProfileForm profile={makeProfile()} />);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(
      await screen.findByText("This action is not allowed."),
    ).toBeInTheDocument();
  });
});

describe("AccessRequestForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders partner-facing request fields without ERP reference input", () => {
    render(<AccessRequestForm />);

    expect(screen.getByLabelText("Partner company name")).toBeInTheDocument();
    expect(screen.getByLabelText("Fiscal code / VAT / IDNO")).toBeInTheDocument();
    expect(screen.getByLabelText("Contact phone")).toBeInTheDocument();
    expect(screen.getByLabelText("Message / comment")).toBeInTheDocument();
    expect(screen.queryByLabelText("1C reference")).not.toBeInTheDocument();
  });

  it("submits partner request data without ERP reference", async () => {
    const user = userEvent.setup();
    mocks.submitAccessRequestAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access request submitted.",
      data: makeAccessRequest(),
    });
    render(<AccessRequestForm />);

    await user.type(screen.getByLabelText("Partner company name"), "Partner Company");
    await user.type(screen.getByLabelText("Fiscal code / VAT / IDNO"), "BG123456789");
    await user.type(screen.getByLabelText("Contact phone"), "+359 1 234");
    await user.type(screen.getByLabelText("Message / comment"), "Please approve.");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(mocks.submitAccessRequestAction).toHaveBeenCalledWith({
      requestedCompanyName: "Partner Company",
      requestedFiscalCode: "BG123456789",
      contactPhone: "+359 1 234",
      message: "Please approve.",
    });
    expect(mocks.submitAccessRequestAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ requestedExternal1cId: expect.anything() }),
    );
  });

  it("displays success result", async () => {
    const user = userEvent.setup();
    mocks.submitAccessRequestAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access request submitted.",
      data: makeAccessRequest(),
    });
    render(<AccessRequestForm />);

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(
      await screen.findByText("Access request submitted."),
    ).toBeInTheDocument();
  });

  it("displays error result", async () => {
    const user = userEvent.setup();
    mocks.submitAccessRequestAction.mockResolvedValue({
      success: false,
      errorCode: "DUPLICATE_REQUEST",
      message: "A pending request already exists.",
      data: null,
    });
    render(<AccessRequestForm />);

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(
      await screen.findByText("A pending request already exists."),
    ).toBeInTheDocument();
  });
});

describe("AccessRequestStatusList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders existing requests", () => {
    render(
      <AccessRequestStatusList
        requests={[
          makeAccessRequest({ id: "request-1", requestedCompanyName: "Alpha" }),
          makeAccessRequest({ id: "request-2", requestedCompanyName: "Beta" }),
        ]}
      />,
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("shows cancel button only for pending requests", () => {
    render(
      <AccessRequestStatusList
        requests={[
          makeAccessRequest({
            id: "pending",
            requestedCompanyName: "Pending Company",
            status: AccessRequestStatus.PendingReview,
          }),
          makeAccessRequest({
            id: "approved",
            requestedCompanyName: "Approved Company",
            status: AccessRequestStatus.Approved,
          }),
          makeAccessRequest({
            id: "rejected",
            requestedCompanyName: "Rejected Company",
            status: AccessRequestStatus.Rejected,
          }),
          makeAccessRequest({
            id: "cancelled",
            requestedCompanyName: "Cancelled Company",
            status: AccessRequestStatus.Cancelled,
          }),
        ]}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Cancel" })).toHaveLength(1);
    const pendingArticle = screen.getByText("Pending Company").closest("article");
    expect(pendingArticle).not.toBeNull();
    expect(
      within(pendingArticle as HTMLElement).getByRole("button", {
        name: "Cancel",
      }),
    ).toBeInTheDocument();
  });

  it("calls cancel action for pending request", async () => {
    const user = userEvent.setup();
    mocks.cancelOwnAccessRequestAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access request cancelled.",
      data: makeAccessRequest({
        id: "request-1",
        status: AccessRequestStatus.Cancelled,
      }),
    });
    render(<AccessRequestStatusList requests={[makeAccessRequest()]} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mocks.cancelOwnAccessRequestAction).toHaveBeenCalledWith({
      requestId: "request-1",
    });
    expect(
      await screen.findByText("Access request cancelled."),
    ).toBeInTheDocument();
  });

  it("does not show cancel for approved, rejected, or cancelled requests", () => {
    render(
      <AccessRequestStatusList
        requests={[
          makeAccessRequest({ status: AccessRequestStatus.Approved }),
          makeAccessRequest({ id: "request-2", status: AccessRequestStatus.Rejected }),
          makeAccessRequest({ id: "request-3", status: AccessRequestStatus.Cancelled }),
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });
});

describe("OnboardingStateCard", () => {
  it("renders safe state messages and links", () => {
    render(
      <OnboardingStateCard
        message="Your request is waiting for Novotech review."
        primaryHref="/onboarding/waiting"
        primaryLabel="View status"
        secondaryHref="/onboarding/profile"
        secondaryLabel="Profile"
        title="Waiting for approval"
      />,
    );

    expect(screen.getByRole("heading", { name: "Waiting for approval" })).toBeInTheDocument();
    expect(
      screen.getByText("Your request is waiting for Novotech review."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View status" })).toHaveAttribute(
      "href",
      "/onboarding/waiting",
    );
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/onboarding/profile",
    );
  });
});

function makeProfile(overrides: Partial<CurrentProfileDto> = {}): CurrentProfileDto {
  return {
    id: "user-1",
    email: "partner@example.com",
    fullName: "Partner User",
    phone: "+359 1 234",
    status: UserStatus.Active,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

function makeAccessRequest(
  overrides: Partial<OwnAccessRequestDto> = {},
): OwnAccessRequestDto {
  return {
    id: "request-1",
    companyId: null,
    requestedCompanyName: "Partner Company",
    message: null,
    requestedFiscalCode: null,
    contactPhone: null,
    status: AccessRequestStatus.PendingReview,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

function makeCompanyMembership(
  overrides: Partial<CompanyMembership> = {},
): CompanyMembership {
  return {
    id: "membership-1",
    userId: "user-1",
    companyId: "company-1",
    roleId: "role-1",
    status: MembershipStatus.Active,
    approvedBy: null,
    approvedAt: null,
    revokedBy: null,
    revokedAt: null,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}
