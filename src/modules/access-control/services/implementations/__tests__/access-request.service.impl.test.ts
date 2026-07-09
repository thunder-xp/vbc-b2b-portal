import { describe, expect, it } from "vitest";

import {
  RepositoryOperationNotAvailableError,
  type AccessRequestRepository,
  type CreateAccessRequestInput,
  type FindPendingAccessRequestDuplicateInput,
  type UpdateAccessRequestStatusInput,
} from "../../../repositories";
import {
  AccessRequestStatus,
  UserStatus,
  UserType,
  type AccessRequest,
  type UserProfile,
} from "../../../types";
import type { UserProfileService } from "../../user-profile.service";
import {
  DuplicateRequestError,
  ForbiddenError,
  InvalidStateError,
  OperationNotAvailableError,
} from "../../errors";
import { DefaultAccessRequestService } from "../access-request.service.impl";

class FakeAccessRequestRepository implements AccessRequestRepository {
  requestById: AccessRequest | null = null;
  requestsByUser: AccessRequest[] = [];
  pendingDuplicate: AccessRequest | null = null;
  createError: Error | null = null;
  updateStatusError: Error | null = null;
  lastFindPendingDuplicateInput: FindPendingAccessRequestDuplicateInput | null =
    null;
  lastCreateInput: CreateAccessRequestInput | null = null;
  lastUpdateStatusInput: UpdateAccessRequestStatusInput | null = null;

  async findById(): Promise<AccessRequest | null> {
    return this.requestById;
  }

  async findByUserId(): Promise<AccessRequest[]> {
    return this.requestsByUser;
  }

  async findPendingDuplicate(
    input: FindPendingAccessRequestDuplicateInput,
  ): Promise<AccessRequest | null> {
    this.lastFindPendingDuplicateInput = input;
    return this.pendingDuplicate;
  }

  async create(input: CreateAccessRequestInput): Promise<AccessRequest> {
    this.lastCreateInput = input;

    if (this.createError) {
      throw this.createError;
    }

    return makeAccessRequest({
      userId: input.userId,
      companyId: input.companyId ?? null,
      requestedExternal1cId: input.requestedExternal1cId ?? null,
      requestedCompanyName: input.requestedCompanyName ?? null,
      requestedFiscalCode: input.requestedFiscalCode ?? null,
      contactPhone: input.contactPhone ?? null,
      message: input.message ?? null,
    });
  }

  async updateStatus(
    input: UpdateAccessRequestStatusInput,
  ): Promise<AccessRequest> {
    this.lastUpdateStatusInput = input;

    if (this.updateStatusError) {
      throw this.updateStatusError;
    }

    return makeAccessRequest({
      id: input.id,
      status: input.status,
    });
  }
}

class FakeUserProfileService implements UserProfileService {
  profile: UserProfile | null = makeUserProfile();

  async getCurrentProfile(): Promise<UserProfile | null> {
    return this.profile;
  }

  async createProfileAfterSignup(): Promise<UserProfile> {
    return makeUserProfile();
  }

  async updateOwnProfile(): Promise<UserProfile> {
    return makeUserProfile();
  }

  async ensureActiveUser(): Promise<UserProfile> {
    return makeUserProfile();
  }
}

describe("DefaultAccessRequestService", () => {
  it("submitAccessRequest succeeds for active user with no duplicate", async () => {
    const repository = new FakeAccessRequestRepository();
    const profileService = new FakeUserProfileService();
    const service = new DefaultAccessRequestService(repository, profileService);

    const result = await service.submitAccessRequest({
      userId: "user-1",
      requestedCompanyName: "Partner Company",
      requestedFiscalCode: "BG123456789",
      contactPhone: "+359 1 234",
      message: "Please approve access.",
    });

    expect(result.status).toBe(AccessRequestStatus.PendingReview);
    expect(repository.lastFindPendingDuplicateInput).toEqual({
      userId: "user-1",
      companyId: undefined,
      requestedCompanyName: "Partner Company",
      requestedFiscalCode: "BG123456789",
    });
    expect(repository.lastCreateInput).toEqual({
      userId: "user-1",
      companyId: undefined,
      requestedCompanyName: "Partner Company",
      requestedFiscalCode: "BG123456789",
      contactPhone: "+359 1 234",
      message: "Please approve access.",
    });
    expect(repository.lastCreateInput).not.toHaveProperty("requestedExternal1cId");
    expect(result.reviewedBy).toBeNull();
    expect(result.reviewedAt).toBeNull();
  });

  it("submitAccessRequest throws DuplicateRequestError for duplicate pending request", async () => {
    const repository = new FakeAccessRequestRepository();
    repository.pendingDuplicate = makeAccessRequest();

    const service = new DefaultAccessRequestService(
      repository,
      new FakeUserProfileService(),
    );

    await expect(
      service.submitAccessRequest({
        userId: "user-1",
        requestedCompanyName: "Partner Company",
      }),
    ).rejects.toBeInstanceOf(DuplicateRequestError);
    expect(repository.lastCreateInput).toBeNull();
  });

  it("submitAccessRequest does not approve, create company, create membership, or call 1C", async () => {
    const repository = new FakeAccessRequestRepository();
    const service = new DefaultAccessRequestService(
      repository,
      new FakeUserProfileService(),
    );

    const result = await service.submitAccessRequest({
      userId: "user-1",
      companyId: "company-1",
    });

    expect(repository.lastCreateInput).toEqual({
      userId: "user-1",
      companyId: "company-1",
      requestedCompanyName: undefined,
      requestedFiscalCode: undefined,
      contactPhone: undefined,
      message: undefined,
    });
    expect(result.status).toBe(AccessRequestStatus.PendingReview);
    expect(result.reviewedBy).toBeNull();
    expect(result.reviewedAt).toBeNull();
  });

  it("getOwnAccessRequests returns repository-provided own requests", async () => {
    const repository = new FakeAccessRequestRepository();
    repository.requestsByUser = [
      makeAccessRequest({ id: "request-1" }),
      makeAccessRequest({ id: "request-2" }),
    ];
    const service = new DefaultAccessRequestService(
      repository,
      new FakeUserProfileService(),
    );

    await expect(service.getOwnAccessRequests("user-1")).resolves.toEqual(
      repository.requestsByUser,
    );
  });

  it("cancelOwnPendingRequest succeeds for owner and pending request", async () => {
    const repository = new FakeAccessRequestRepository();
    repository.requestById = makeAccessRequest({
      id: "request-1",
      userId: "user-1",
      status: AccessRequestStatus.PendingReview,
    });
    const service = new DefaultAccessRequestService(
      repository,
      new FakeUserProfileService(),
    );

    const result = await service.cancelOwnPendingRequest("user-1", "request-1");

    expect(repository.lastUpdateStatusInput).toEqual({
      id: "request-1",
      status: AccessRequestStatus.Cancelled,
    });
    expect(result.status).toBe(AccessRequestStatus.Cancelled);
  });

  it("cancelOwnPendingRequest throws ForbiddenError for non-owner", async () => {
    const repository = new FakeAccessRequestRepository();
    repository.requestById = makeAccessRequest({
      userId: "other-user",
      status: AccessRequestStatus.PendingReview,
    });
    const service = new DefaultAccessRequestService(
      repository,
      new FakeUserProfileService(),
    );

    await expect(
      service.cancelOwnPendingRequest("user-1", "request-1"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.lastUpdateStatusInput).toBeNull();
  });

  it.each([
    AccessRequestStatus.Approved,
    AccessRequestStatus.Rejected,
    AccessRequestStatus.Cancelled,
  ])(
    "cancelOwnPendingRequest throws InvalidStateError for %s request",
    async (status) => {
      const repository = new FakeAccessRequestRepository();
      repository.requestById = makeAccessRequest({
        userId: "user-1",
        status,
      });
      const service = new DefaultAccessRequestService(
        repository,
        new FakeUserProfileService(),
      );

      await expect(
        service.cancelOwnPendingRequest("user-1", "request-1"),
      ).rejects.toBeInstanceOf(InvalidStateError);
      expect(repository.lastUpdateStatusInput).toBeNull();
    },
  );

  it("maps unavailable repository errors safely", async () => {
    const repository = new FakeAccessRequestRepository();
    repository.createError = new RepositoryOperationNotAvailableError(
      "access_requests.create",
    );
    const service = new DefaultAccessRequestService(
      repository,
      new FakeUserProfileService(),
    );

    await expect(
      service.submitAccessRequest({
        userId: "user-1",
        requestedCompanyName: "Partner Company",
      }),
    ).rejects.toBeInstanceOf(OperationNotAvailableError);
  });
});

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
