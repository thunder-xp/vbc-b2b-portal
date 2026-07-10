import { describe, expect, it } from "vitest";

import type {
  AccessRequestRepository,
  CompanyMembershipRepository,
  CreateCompanyMembershipInput,
  CreatePartnerCompanyInput,
  PartnerCompanyRepository,
  RolePermissionRepository,
  UpdateAccessRequestStatusInput,
  UpdateCompanyMembershipStatusInput,
  UpdatePartnerCompanyApprovalBindingInput,
  UserProfileRepository,
} from "../../../repositories";
import {
  AccessRequestStatus,
  CompanyStatus,
  MembershipStatus,
  RoleScope,
  UserStatus,
  UserType,
  type AccessRequest,
  type CompanyMembership,
  type PartnerCompany,
  type Permission,
  type Role,
  type UserProfile,
} from "../../../types";
import { ForbiddenError, InvalidStateError } from "../../errors";
import { DefaultAccessApprovalService } from "../access-approval.service.impl";

describe("DefaultAccessApprovalService", () => {
  it("blocks partner users from approval console operations", async () => {
    const fixtures = makeFixtures({
      reviewer: makeUserProfile({
        id: "reviewer-1",
        status: UserStatus.Active,
        userType: UserType.Partner,
      }),
    });
    const service = makeService(fixtures);

    await expect(
      service.listPendingReviewRequests("reviewer-1"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("approves a pending request by binding 1C references and creating active access", async () => {
    const fixtures = makeFixtures();
    const service = makeService(fixtures);

    const result = await service.approveAccessRequest({
      actorUserId: "reviewer-1",
      requestId: "request-1",
      external1cId: "PARTNER-1C",
      external1cContractId: "CONTRACT-1C",
      external1cPriceTypeId: "PRICE-TYPE-1C",
      decisionReason: "Validated in 1C.",
    });

    expect(fixtures.partnerCompanyRepository.lastCreateInput).toEqual({
      external1cId: "PARTNER-1C",
      external1cContractId: "CONTRACT-1C",
      external1cPriceTypeId: "PRICE-TYPE-1C",
      displayName: "Partner Company",
    });
    expect(fixtures.companyMembershipRepository.lastCreateInput).toMatchObject({
      userId: "partner-1",
      companyId: "company-1",
      roleId: "role-partner-owner",
      status: MembershipStatus.Active,
      approvedBy: "reviewer-1",
    });
    expect(fixtures.userProfileRepository.activatedUserId).toBe("partner-1");
    expect(fixtures.accessRequestRepository.lastUpdateInput).toMatchObject({
      id: "request-1",
      status: AccessRequestStatus.Approved,
      companyId: "company-1",
      requestedExternal1cId: "PARTNER-1C",
      reviewedBy: "reviewer-1",
      decisionReason: "Validated in 1C.",
    });
    expect(result.request.status).toBe(AccessRequestStatus.Approved);
    expect(result.membership.status).toBe(MembershipStatus.Active);
    expect(result.requester.status).toBe(UserStatus.Active);
  });

  it("rejects a pending request without creating company or membership", async () => {
    const fixtures = makeFixtures();
    const service = makeService(fixtures);

    const result = await service.rejectAccessRequest({
      actorUserId: "reviewer-1",
      requestId: "request-1",
      reason: "Company data did not match.",
    });

    expect(fixtures.partnerCompanyRepository.lastCreateInput).toBeNull();
    expect(fixtures.companyMembershipRepository.lastCreateInput).toBeNull();
    expect(fixtures.accessRequestRepository.lastUpdateInput).toMatchObject({
      id: "request-1",
      status: AccessRequestStatus.Rejected,
      reviewedBy: "reviewer-1",
      decisionReason: "Company data did not match.",
    });
    expect(result.status).toBe(AccessRequestStatus.Rejected);
  });

  it("does not approve non-pending-review requests", async () => {
    const fixtures = makeFixtures({
      request: makeAccessRequest({ status: AccessRequestStatus.Approved }),
    });
    const service = makeService(fixtures);

    await expect(
      service.approveAccessRequest({
        actorUserId: "reviewer-1",
        requestId: "request-1",
        external1cId: "PARTNER-1C",
        external1cContractId: "CONTRACT-1C",
        external1cPriceTypeId: "PRICE-TYPE-1C",
      }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    expect(fixtures.companyMembershipRepository.lastCreateInput).toBeNull();
  });
});

function makeService(fixtures: Fixtures): DefaultAccessApprovalService {
  return new DefaultAccessApprovalService(
    fixtures.accessRequestRepository,
    fixtures.userProfileRepository,
    fixtures.partnerCompanyRepository,
    fixtures.companyMembershipRepository,
    fixtures.rolePermissionRepository,
  );
}

type Fixtures = ReturnType<typeof makeFixtures>;

function makeFixtures(
  overrides: {
    request?: AccessRequest;
    requester?: UserProfile;
    reviewer?: UserProfile;
  } = {},
) {
  const accessRequestRepository = new FakeAccessRequestRepository(
    overrides.request ?? makeAccessRequest(),
  );
  const userProfileRepository = new FakeUserProfileRepository({
    "partner-1": overrides.requester ?? makeUserProfile({ id: "partner-1" }),
    "reviewer-1":
      overrides.reviewer ??
      makeUserProfile({
        id: "reviewer-1",
        status: UserStatus.Active,
        userType: UserType.Admin,
      }),
  });

  return {
    accessRequestRepository,
    userProfileRepository,
    partnerCompanyRepository: new FakePartnerCompanyRepository(),
    companyMembershipRepository: new FakeCompanyMembershipRepository(),
    rolePermissionRepository: new FakeRolePermissionRepository(),
  };
}

class FakeAccessRequestRepository implements AccessRequestRepository {
  lastUpdateInput: UpdateAccessRequestStatusInput | null = null;

  constructor(private request: AccessRequest) {}

  async findById(): Promise<AccessRequest | null> {
    return this.request;
  }

  async findByUserId(): Promise<AccessRequest[]> {
    return [this.request];
  }

  async findPendingReview(): Promise<AccessRequest[]> {
    return this.request.status === AccessRequestStatus.PendingReview
      ? [this.request]
      : [];
  }

  async findPendingDuplicate(): Promise<AccessRequest | null> {
    return null;
  }

  async create(): Promise<AccessRequest> {
    throw new Error("Not needed");
  }

  async updateStatus(input: UpdateAccessRequestStatusInput): Promise<AccessRequest> {
    this.lastUpdateInput = input;
    this.request = makeAccessRequest({
      ...this.request,
      companyId: input.companyId ?? this.request.companyId,
      requestedExternal1cId:
        input.requestedExternal1cId ?? this.request.requestedExternal1cId,
      status: input.status,
      reviewedBy: input.reviewedBy ?? null,
      reviewedAt: input.reviewedAt ?? null,
      decisionReason: input.decisionReason ?? null,
    });

    return this.request;
  }
}

class FakeUserProfileRepository implements UserProfileRepository {
  activatedUserId: string | null = null;

  constructor(private readonly profiles: Record<string, UserProfile>) {}

  async findById(userId: string): Promise<UserProfile | null> {
    return this.profiles[userId] ?? null;
  }

  async findByEmail(): Promise<UserProfile | null> {
    return null;
  }

  async create(): Promise<UserProfile> {
    throw new Error("Not needed");
  }

  async activatePartnerProfile(userId: string): Promise<UserProfile> {
    this.activatedUserId = userId;
    const profile = this.profiles[userId] ?? makeUserProfile({ id: userId });
    this.profiles[userId] = {
      ...profile,
      status: UserStatus.Active,
      userType: UserType.Partner,
    };

    return this.profiles[userId];
  }

  async updateOwnSafeFields(): Promise<UserProfile> {
    throw new Error("Not needed");
  }
}

class FakePartnerCompanyRepository implements PartnerCompanyRepository {
  lastCreateInput: CreatePartnerCompanyInput | null = null;

  async findById(): Promise<PartnerCompany | null> {
    return null;
  }

  async findByExternal1cId(): Promise<PartnerCompany | null> {
    return null;
  }

  async findCompaniesForUser(): Promise<PartnerCompany[]> {
    return [];
  }

  async create(input: CreatePartnerCompanyInput): Promise<PartnerCompany> {
    this.lastCreateInput = input;

    return makePartnerCompany({
      external1cId: input.external1cId,
      external1cContractId: input.external1cContractId,
      external1cPriceTypeId: input.external1cPriceTypeId,
      displayName: input.displayName,
    });
  }

  async updateApprovalBinding(
    _input: UpdatePartnerCompanyApprovalBindingInput,
  ): Promise<PartnerCompany> {
    throw new Error("Not needed");
  }
}

class FakeCompanyMembershipRepository implements CompanyMembershipRepository {
  lastCreateInput: CreateCompanyMembershipInput | null = null;

  async findByUserId(): Promise<CompanyMembership[]> {
    return [];
  }

  async findActiveMembership(): Promise<CompanyMembership | null> {
    return null;
  }

  async create(input: CreateCompanyMembershipInput): Promise<CompanyMembership> {
    this.lastCreateInput = input;

    return makeCompanyMembership({
      userId: input.userId,
      companyId: input.companyId,
      roleId: input.roleId,
      status: input.status ?? MembershipStatus.PendingApproval,
      approvedBy: input.approvedBy ?? null,
      approvedAt: input.approvedAt ?? null,
    });
  }

  async updateStatus(
    _input: UpdateCompanyMembershipStatusInput,
  ): Promise<CompanyMembership> {
    throw new Error("Not needed");
  }
}

class FakeRolePermissionRepository implements RolePermissionRepository {
  async findRoleByCode(): Promise<Role | null> {
    return {
      id: "role-partner-owner",
      code: "partner_owner",
      name: "Partner Owner",
      scope: RoleScope.Partner,
      createdAt: now,
    };
  }

  async findPermissionsByRoleId(): Promise<Permission[]> {
    return [];
  }

  async userHasPermission(): Promise<boolean> {
    return false;
  }
}

function makeAccessRequest(
  overrides: Partial<AccessRequest> = {},
): AccessRequest {
  return {
    id: "request-1",
    userId: "partner-1",
    companyId: null,
    requestedExternal1cId: null,
    requestedCompanyName: "Partner Company",
    requestedFiscalCode: "BG123456789",
    contactPhone: "+359 1 234",
    message: "Please approve.",
    status: AccessRequestStatus.PendingReview,
    reviewedBy: null,
    reviewedAt: null,
    decisionReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    email: "user@example.com",
    fullName: "User",
    phone: null,
    status: UserStatus.Registered,
    userType: UserType.External,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePartnerCompany(
  overrides: Partial<PartnerCompany> = {},
): PartnerCompany {
  return {
    id: "company-1",
    external1cId: "PARTNER-1C",
    external1cContractId: "CONTRACT-1C",
    external1cPriceTypeId: "PRICE-TYPE-1C",
    displayName: "Partner Company",
    status: CompanyStatus.Active,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCompanyMembership(
  overrides: Partial<CompanyMembership> = {},
): CompanyMembership {
  return {
    id: "membership-1",
    userId: "partner-1",
    companyId: "company-1",
    roleId: "role-partner-owner",
    status: MembershipStatus.Active,
    approvedBy: "reviewer-1",
    approvedAt: now,
    revokedBy: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const now = "2026-07-09T00:00:00.000Z";
