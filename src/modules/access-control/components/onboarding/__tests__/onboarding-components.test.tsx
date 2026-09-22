import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccessRequestStatus,
  UserStatus,
} from "../../../types";
import type { CurrentProfileDto } from "../../../actions/current-profile.action";
import type { OwnAccessRequestDto } from "../../../actions/get-access-requests.action";
import { AccessRequestForm } from "../AccessRequestForm";
import { AccessRequestStatusList } from "../AccessRequestStatusList";
import { OnboardingStateCard } from "../OnboardingStateCard";
import { ProfileForm } from "../ProfileForm";

const mocks = vi.hoisted(() => ({
  createProfileAction: vi.fn(),
  routerRefresh: vi.fn(),
  routerReplace: vi.fn(),
  updateOwnProfileAction: vi.fn(),
  submitAccessRequestAction: vi.fn(),
  cancelOwnAccessRequestAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.routerRefresh,
    replace: mocks.routerReplace,
  }),
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
    vi.resetAllMocks();
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
    expect(mocks.routerReplace).toHaveBeenCalledWith(
      "/onboarding/access-request",
    );
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
    expect(mocks.routerRefresh).toHaveBeenCalledTimes(1);
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

  it("shows an actionable phone ownership error during profile creation", async () => {
    const user = userEvent.setup();
    mocks.createProfileAction.mockResolvedValue({
      success: false,
      errorCode: "PHONE_ALREADY_IN_USE",
      message: "This phone is already linked to another account. Contact Novotech support for an ownership review.",
      data: null,
    });
    render(<ProfileForm profile={null} />);

    await user.type(screen.getByLabelText("Phone"), "+37367497101");
    await user.click(screen.getByRole("button", { name: "Create profile" }));

    expect(await screen.findByText(/ownership review/)).toBeInTheDocument();
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });
});

describe("AccessRequestForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders partner-facing request fields without ERP reference input", () => {
    render(<AccessRequestForm />);

    expect(screen.getByLabelText("Название компании")).toBeInTheDocument();
    expect(screen.getByLabelText("IDNO")).toBeInTheDocument();
    expect(screen.getByLabelText("Контактный телефон")).toBeInTheDocument();
    expect(screen.getByLabelText("Комментарий")).toBeInTheDocument();
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

    await user.type(screen.getByLabelText("Название компании"), "Partner Company");
    await user.type(screen.getByLabelText("IDNO"), "123456789");
    await user.type(screen.getByLabelText("Контактный телефон"), "+359 1 234");
    await user.type(screen.getByLabelText("Комментарий"), "Please approve.");
    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));

    expect(mocks.submitAccessRequestAction).toHaveBeenCalledWith({
      requestedCompanyName: "Partner Company",
      requestedFiscalCode: "123456789",
      contactPhone: "+359 1 234",
      message: "Please approve.",
    });
    expect(mocks.submitAccessRequestAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ requestedExternal1cId: expect.anything() }),
    );
  });

  it("uses individual identity labels and prefills governed profile values", () => {
    render(
      <AccessRequestForm
        initialName="Culacov Vasili"
        initialPhone="+373 69 982 220"
        legalForm="INDIVIDUAL"
      />,
    );

    expect(screen.getByLabelText("Имя и фамилия")).toHaveValue("Culacov Vasili");
    expect(screen.getByLabelText("IDNP")).toBeInTheDocument();
    expect(screen.getByLabelText("Контактный телефон")).toHaveValue("+373 69 982 220");
    expect(screen.queryByLabelText("Название компании")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("IDNO")).not.toBeInTheDocument();
  });

  it("redirects to waiting after successful submit", async () => {
    const user = userEvent.setup();
    mocks.submitAccessRequestAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access request submitted.",
      data: makeAccessRequest(),
    });
    render(<AccessRequestForm />);

    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith("/onboarding/waiting");
    });
  });

  it("redirects duplicate pending request to waiting", async () => {
    const user = userEvent.setup();
    mocks.submitAccessRequestAction.mockResolvedValue({
      success: false,
      errorCode: "DUPLICATE_REQUEST",
      message: "A pending request already exists.",
      data: null,
    });
    render(<AccessRequestForm />);

    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith("/onboarding/waiting");
    });
    expect(
      screen.queryByText("A pending request already exists."),
    ).not.toBeInTheDocument();
  });

  it("displays error result", async () => {
    const user = userEvent.setup();
    mocks.submitAccessRequestAction.mockResolvedValue({
      success: false,
      errorCode: "ACCESS_CONTROL_ERROR",
      message:
        "We could not submit your request. Please check your profile or contact Novotech support.",
      data: null,
    });
    render(<AccessRequestForm />);

    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));

    expect(
      await screen.findByText(
        "We could not submit your request. Please check your profile or contact Novotech support.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.routerReplace).not.toHaveBeenCalled();
    });
  });
});

describe("AccessRequestStatusList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

    expect(screen.getAllByRole("button", { name: "Отменить заявку" })).toHaveLength(1);
    const pendingArticle = screen.getByText("Pending Company").closest("article");
    expect(pendingArticle).not.toBeNull();
    expect(
      within(pendingArticle as HTMLElement).getByRole("button", {
        name: "Отменить заявку",
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

    await user.click(screen.getByRole("button", { name: "Отменить заявку" }));

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
    decisionReason: null,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}
