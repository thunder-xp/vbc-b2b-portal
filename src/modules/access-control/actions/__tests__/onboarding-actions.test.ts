import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DuplicateRequestError,
  ForbiddenError,
  InvalidStateError,
  MembershipRequiredError,
  NotFoundError,
  OperationNotAvailableError,
  PermissionRequiredError,
  UnauthenticatedError,
} from "../../services";
import {
  AccessRequestStatus,
  MembershipStatus,
  UserStatus,
  UserType,
  type AccessRequest,
  type CompanyMembership,
  type UserProfile,
} from "../../types";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn<() => Promise<{ id: string; email: string }>>(),
  getAuthenticatedUserId: vi.fn<() => Promise<string>>(),
  createUserProfileService: vi.fn(),
  createAccessRequestService: vi.fn(),
  createCompanyAccessService: vi.fn(),
  userProfileService: {
    createProfileAfterSignup: vi.fn(),
    getCurrentProfile: vi.fn(),
    updateOwnProfile: vi.fn(),
  },
  accessRequestService: {
    submitAccessRequest: vi.fn(),
    getOwnAccessRequests: vi.fn(),
    cancelOwnPendingRequest: vi.fn(),
  },
  companyAccessService: {
    getOwnMemberships: vi.fn(),
  },
}));

vi.mock("../service-factory", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
  createUserProfileService: mocks.createUserProfileService,
  createAccessRequestService: mocks.createAccessRequestService,
  createCompanyAccessService: mocks.createCompanyAccessService,
}));

import { failureFromError } from "../action-result";
import { cancelOwnAccessRequestAction } from "../cancel-access-request.action";
import { createProfileAction } from "../create-profile.action";
import { getCurrentProfileAction } from "../current-profile.action";
import { getOwnAccessRequestsAction } from "../get-access-requests.action";
import { getOwnMembershipsAction } from "../get-memberships.action";
import { submitAccessRequestAction } from "../submit-access-request.action";
import { updateOwnProfileAction } from "../update-profile.action";

describe("onboarding Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getAuthenticatedUserId.mockResolvedValue("user-1");
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "partner@example.com",
    });
    mocks.createUserProfileService.mockReturnValue(mocks.userProfileService);
    mocks.createAccessRequestService.mockReturnValue(
      mocks.accessRequestService,
    );
    mocks.createCompanyAccessService.mockReturnValue(
      mocks.companyAccessService,
    );
  });

  it.each([
    ["createProfileAction", () => createProfileAction({})],
    ["getCurrentProfileAction", () => getCurrentProfileAction()],
    ["updateOwnProfileAction", () => updateOwnProfileAction()],
    ["submitAccessRequestAction", () => submitAccessRequestAction()],
    ["getOwnAccessRequestsAction", () => getOwnAccessRequestsAction()],
    [
      "cancelOwnAccessRequestAction",
      () => cancelOwnAccessRequestAction({ requestId: "request-1" }),
    ],
    ["getOwnMembershipsAction", () => getOwnMembershipsAction()],
  ])("%s returns a safe error when unauthenticated", async (_name, action) => {
    mocks.getAuthenticatedUserId.mockRejectedValue(new UnauthenticatedError());
    mocks.getAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

    await expect(action()).resolves.toEqual({
      success: false,
      errorCode: "AUTH_REQUIRED",
      message: "Authentication is required.",
      data: null,
    });
  });

  it("createProfileAction creates a safe external profile for authenticated user", async () => {
    const profile = makeUserProfile({
      status: UserStatus.Registered,
      userType: UserType.External,
      fullName: "Partner User",
      phone: "+359 1 234",
    });
    mocks.userProfileService.createProfileAfterSignup.mockResolvedValue(profile);

    const result = await createProfileAction({
      fullName: "  Partner User  ",
      phone: "  +359 1 234  ",
    });

    expect(mocks.userProfileService.createProfileAfterSignup).toHaveBeenCalledWith({
      userId: "user-1",
      email: "partner@example.com",
      fullName: "Partner User",
      phone: "+359 1 234",
    });
    expect(result).toEqual({
      success: true,
      errorCode: null,
      message: "Profile created.",
      data: {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        phone: profile.phone,
        status: profile.status,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    });
    expect(JSON.stringify(result)).not.toContain("userType");
  });

  it("getCurrentProfileAction returns profile data", async () => {
    const profile = makeUserProfile();
    mocks.userProfileService.getCurrentProfile.mockResolvedValue(profile);

    const result = await getCurrentProfileAction();

    expect(mocks.getAuthenticatedUserId).toHaveBeenCalledOnce();
    expect(mocks.userProfileService.getCurrentProfile).toHaveBeenCalledWith(
      "user-1",
    );
    expect(result).toEqual({
      success: true,
      errorCode: null,
      message: "Current profile loaded.",
      data: {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        phone: profile.phone,
        status: profile.status,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    });
  });

  it("updateOwnProfileAction updates safe fields only", async () => {
    const profile = makeUserProfile({
      fullName: "Partner User",
      phone: "+359 1 234",
    });
    mocks.userProfileService.updateOwnProfile.mockResolvedValue(profile);

    const result = await updateOwnProfileAction({
      fullName: "  Partner User  ",
      phone: "  +359 1 234  ",
    });

    expect(mocks.userProfileService.updateOwnProfile).toHaveBeenCalledWith(
      "user-1",
      {
        fullName: "Partner User",
        phone: "+359 1 234",
      },
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: "user-1",
      fullName: "Partner User",
      phone: "+359 1 234",
    });
  });

  it("submitAccessRequestAction submits partner request data without ERP reference input", async () => {
    const request = makeAccessRequest({
      requestedCompanyName: "Partner Company",
      requestedFiscalCode: "BG123456789",
      contactPhone: "+359 1 234",
      message: "Please approve.",
    });
    mocks.accessRequestService.submitAccessRequest.mockResolvedValue(request);

    const result = await submitAccessRequestAction({
      requestedCompanyName: "  Partner Company  ",
      requestedFiscalCode: "  BG123456789  ",
      contactPhone: "  +359 1 234  ",
      message: "  Please approve.  ",
    });

    expect(mocks.accessRequestService.submitAccessRequest).toHaveBeenCalledWith({
      userId: "user-1",
      companyId: null,
      requestedCompanyName: "Partner Company",
      requestedFiscalCode: "BG123456789",
      contactPhone: "+359 1 234",
      message: "Please approve.",
    });
    expect(result).toEqual({
      success: true,
      errorCode: null,
      message: "Access request submitted.",
      data: {
        id: request.id,
        companyId: request.companyId,
        requestedCompanyName: request.requestedCompanyName,
        requestedFiscalCode: request.requestedFiscalCode,
        contactPhone: request.contactPhone,
        message: request.message,
        status: request.status,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      },
    });
    expect(JSON.stringify(result)).not.toContain("requestedExternal1cId");
    expect(JSON.stringify(result)).not.toContain("reviewedBy");
    expect(JSON.stringify(result)).not.toContain("reviewedAt");
  });

  it("submitAccessRequestAction does not expose approval/company/membership behavior", async () => {
    const request = makeAccessRequest();
    mocks.accessRequestService.submitAccessRequest.mockResolvedValue(request);

    await submitAccessRequestAction({
      companyId: "company-1",
      requestedCompanyName: "Partner Company",
    });

    expect(mocks.accessRequestService.submitAccessRequest).toHaveBeenCalledOnce();
    expect(mocks.accessRequestService.getOwnAccessRequests).not.toHaveBeenCalled();
    expect(
      mocks.accessRequestService.cancelOwnPendingRequest,
    ).not.toHaveBeenCalled();
    expect(mocks.companyAccessService.getOwnMemberships).not.toHaveBeenCalled();
  });

  it("getOwnAccessRequestsAction returns own requests", async () => {
    const requests = [
      makeAccessRequest({ id: "request-1" }),
      makeAccessRequest({ id: "request-2", status: AccessRequestStatus.Cancelled }),
    ];
    mocks.accessRequestService.getOwnAccessRequests.mockResolvedValue(requests);

    const result = await getOwnAccessRequestsAction();

    expect(mocks.accessRequestService.getOwnAccessRequests).toHaveBeenCalledWith(
      "user-1",
    );
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it("cancelOwnAccessRequestAction cancels own pending request through service", async () => {
    const request = makeAccessRequest({
      id: "request-1",
      status: AccessRequestStatus.Cancelled,
    });
    mocks.accessRequestService.cancelOwnPendingRequest.mockResolvedValue(request);

    const result = await cancelOwnAccessRequestAction({
      requestId: "  request-1  ",
    });

    expect(
      mocks.accessRequestService.cancelOwnPendingRequest,
    ).toHaveBeenCalledWith("user-1", "request-1");
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: "request-1",
      status: AccessRequestStatus.Cancelled,
    });
  });

  it("cancelOwnAccessRequestAction validates request id before auth", async () => {
    const result = await cancelOwnAccessRequestAction({ requestId: "  " });

    expect(result).toEqual({
      success: false,
      errorCode: "INVALID_INPUT",
      message: "Access request is required.",
      data: null,
    });
    expect(mocks.getAuthenticatedUserId).not.toHaveBeenCalled();
    expect(
      mocks.accessRequestService.cancelOwnPendingRequest,
    ).not.toHaveBeenCalled();
  });

  it("getOwnMembershipsAction returns own memberships", async () => {
    const memberships = [makeCompanyMembership()];
    mocks.companyAccessService.getOwnMemberships.mockResolvedValue(memberships);

    const result = await getOwnMembershipsAction();

    expect(mocks.companyAccessService.getOwnMemberships).toHaveBeenCalledWith(
      "user-1",
    );
    expect(result).toEqual({
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
  });
});

describe("failureFromError", () => {
  it.each([
    [new UnauthenticatedError("raw auth detail"), "AUTH_REQUIRED"],
    [new ForbiddenError("raw forbidden detail"), "FORBIDDEN"],
    [new NotFoundError("raw not found detail"), "NOT_FOUND"],
    [new InvalidStateError("raw state detail"), "INVALID_STATE"],
    [new DuplicateRequestError("raw duplicate detail"), "DUPLICATE_REQUEST"],
    [
      new MembershipRequiredError("raw membership detail"),
      "MEMBERSHIP_REQUIRED",
    ],
    [
      new PermissionRequiredError("raw permission detail"),
      "PERMISSION_REQUIRED",
    ],
    [
      new OperationNotAvailableError("raw unavailable detail"),
      "OPERATION_NOT_AVAILABLE",
    ],
    [new Error("raw stack detail"), "SYSTEM_ERROR"],
  ])("maps %s safely", (error, errorCode) => {
    const result = failureFromError(error);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(errorCode);
    expect(result.data).toBeNull();
    expect(result.message).not.toContain("raw");
    expect(result.message).not.toContain("stack");
    expect(result.message).not.toContain("Supabase");
    expect(result.message).not.toContain("repository");
  });
});

function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    email: "partner@example.com",
    fullName: "Partner User",
    phone: "+359 1 234",
    status: UserStatus.Active,
    userType: UserType.Partner,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

function makeAccessRequest(
  overrides: Partial<AccessRequest> = {},
): AccessRequest {
  return {
    id: "request-1",
    userId: "user-1",
    companyId: null,
    requestedExternal1cId: null,
    requestedCompanyName: "Partner Company",
    requestedFiscalCode: null,
    contactPhone: null,
    message: null,
    status: AccessRequestStatus.PendingReview,
    reviewedBy: null,
    reviewedAt: null,
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
