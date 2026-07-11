import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("allows active internal manager users to access approval console", async () => {
    const fixtures = makeFixtures({
      reviewer: makeUserProfile({
        id: "reviewer-1",
        email: "manager@novotech.local",
        status: UserStatus.Active,
        userType: UserType.Internal,
      }),
    });
    const service = makeService(fixtures);

    await expect(
      service.listPendingReviewRequests("reviewer-1"),
    ).resolves.toHaveLength(1);
  });

  it("allows configured development test manager without changing stored role", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_TEST_MODE", "true");
    vi.stubEnv("DEV_TEST_MANAGER_EMAIL", "manager@example.com");
    const fixtures = makeFixtures({
      reviewer: makeUserProfile({
        id: "reviewer-1",
        email: "manager@example.com",
        status: UserStatus.Active,
        userType: UserType.External,
      }),
    });
    const service = makeService(fixtures);

    const result = await service.listPendingReviewRequests("reviewer-1");

    expect(result).toHaveLength(1);
    expect(fixtures.userProfileRepository.profiles["reviewer-1"]?.userType).toBe(
      UserType.External,
    );
  });

  it("approves request before creating active access", async () => {
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
      external1cCode: null,
      external1cContractId: "CONTRACT-1C",
      external1cPriceTypeId: "PRICE-TYPE-1C",
      displayName: "Partner Company",
    });
    expect(fixtures.accessRequestRepository.lastUpdateInput).toMatchObject({
      id: "request-1",
      status: AccessRequestStatus.Approved,
      companyId: "company-1",
      requestedExternal1cId: "PARTNER-1C",
      reviewedBy: "reviewer-1",
      decisionReason: "Validated in 1C.",
    });
    expect(fixtures.accessRequestRepository.updateCalls).toBe(1);
    expect(fixtures.accessRequestRepository.updateCalls).toBeLessThan(
      fixtures.companyMembershipRepository.createCallOrder ?? Number.POSITIVE_INFINITY,
    );
    expect(fixtures.accessRequestRepository.updateCalls).toBeLessThan(
      fixtures.userProfileRepository.activateCallOrder ?? Number.POSITIVE_INFINITY,
    );
    expect(fixtures.companyMembershipRepository.lastCreateInput).toMatchObject({
      userId: "partner-1",
      companyId: "company-1",
      roleId: "role-partner-owner",
      status: MembershipStatus.Active,
      approvedBy: "reviewer-1",
    });
    expect(fixtures.userProfileRepository.activatedUserId).toBe("partner-1");
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

  it("does not approve rejected requests", async () => {
    const fixtures = makeFixtures({
      request: makeAccessRequest({ status: AccessRequestStatus.Rejected }),
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

  it("requires a non-whitespace 1C partner reference on approval", async () => {
    const fixtures = makeFixtures();
    const service = makeService(fixtures);

    await expect(
      service.approveAccessRequest({
        actorUserId: "reviewer-1",
        requestId: "request-1",
        external1cId: " ",
        external1cContractId: "CONTRACT-1C",
        external1cPriceTypeId: "PRICE-TYPE-1C",
      }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    expect(fixtures.partnerCompanyRepository.lastCreateInput).toBeNull();
  });

  it("requires a non-whitespace price type reference on approval", async () => {
    const fixtures = makeFixtures();
    const service = makeService(fixtures);

    await expect(
      service.approveAccessRequest({
        actorUserId: "reviewer-1",
        requestId: "request-1",
        external1cId: "PARTNER-1C",
        external1cContractId: null,
        external1cPriceTypeId: " ",
      }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    expect(fixtures.partnerCompanyRepository.lastCreateInput).toBeNull();
  });

  it("approves with a null contract when partner and price type are selected", async () => {
    const fixtures = makeFixtures();
    const service = makeService(fixtures);

    await service.approveAccessRequest({
      actorUserId: "reviewer-1",
      requestId: "request-1",
      external1cId: "PARTNER-1C",
      external1cCode: null,
      external1cContractId: null,
      external1cPriceTypeId: "PRICE-TYPE-1C",
    });

    expect(fixtures.partnerCompanyRepository.lastCreateInput).toMatchObject({
      external1cId: "PARTNER-1C",
      external1cCode: null,
      external1cContractId: null,
      external1cPriceTypeId: "PRICE-TYPE-1C",
    });
  });

  it("trims internal references before storing approval binding", async () => {
    const fixtures = makeFixtures();
    const service = makeService(fixtures);

    await service.approveAccessRequest({
      actorUserId: "reviewer-1",
      requestId: "request-1",
      external1cId: " PARTNER-1C ",
      external1cContractId: " CONTRACT-1C ",
      external1cPriceTypeId: " PRICE-TYPE-1C ",
      decisionReason: " Approved ",
    });

    expect(fixtures.partnerCompanyRepository.lastCreateInput).toMatchObject({
      external1cId: "PARTNER-1C",
      external1cContractId: "CONTRACT-1C",
      external1cPriceTypeId: "PRICE-TYPE-1C",
    });
    expect(fixtures.accessRequestRepository.lastUpdateInput).toMatchObject({
      requestedExternal1cId: "PARTNER-1C",
      decisionReason: "Approved",
    });
  });

  it("requires rejection reason", async () => {
    const fixtures = makeFixtures();
    const service = makeService(fixtures);

    await expect(
      service.rejectAccessRequest({
        actorUserId: "reviewer-1",
        requestId: "request-1",
        reason: " ",
      }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    expect(fixtures.accessRequestRepository.lastUpdateInput).toBeNull();
  });

  it("reuses existing company by 1C reference and does not create duplicate company", async () => {
    const existingCompany = makePartnerCompany({
      id: "existing-company",
      external1cId: "PARTNER-1C",
    });
    const fixtures = makeFixtures({ existingCompany });
    const service = makeService(fixtures);

    const result = await service.approveAccessRequest({
      actorUserId: "reviewer-1",
      requestId: "request-1",
      external1cId: "PARTNER-1C",
      external1cContractId: "CONTRACT-NEW",
      external1cPriceTypeId: "PRICE-NEW",
    });

    expect(fixtures.partnerCompanyRepository.lastCreateInput).toBeNull();
    expect(fixtures.partnerCompanyRepository.lastUpdateBindingInput).toEqual({
      companyId: "existing-company",
      external1cCode: null,
      external1cContractId: "CONTRACT-NEW",
      external1cPriceTypeId: "PRICE-NEW",
      displayName: "Partner Company",
    });
    expect(result.company.id).toBe("existing-company");
  });

  it("does not create duplicate active membership", async () => {
    const existingMembership = makeCompanyMembership({
      id: "existing-membership",
      userId: "partner-1",
      companyId: "company-1",
      status: MembershipStatus.Active,
    });
    const fixtures = makeFixtures({ existingMembership });
    const service = makeService(fixtures);

    const result = await service.approveAccessRequest({
      actorUserId: "reviewer-1",
      requestId: "request-1",
      external1cId: "PARTNER-1C",
      external1cContractId: "CONTRACT-1C",
      external1cPriceTypeId: "PRICE-TYPE-1C",
    });

    expect(fixtures.companyMembershipRepository.lastCreateInput).toBeNull();
    expect(result.membership.id).toBe("existing-membership");
  });

  it("approval retry does not duplicate company or membership", async () => {
    const existingCompany = makePartnerCompany({
      id: "company-1",
      external1cId: "PARTNER-1C",
    });
    const existingMembership = makeCompanyMembership({
      id: "membership-1",
      userId: "partner-1",
      companyId: "company-1",
      status: MembershipStatus.Active,
    });
    const fixtures = makeFixtures({
      existingCompany,
      existingMembership,
      request: makeAccessRequest({
        status: AccessRequestStatus.Approved,
        companyId: "company-1",
        requestedExternal1cId: "PARTNER-1C",
      }),
    });
    const service = makeService(fixtures);

    const result = await service.approveAccessRequest({
      actorUserId: "reviewer-1",
      requestId: "request-1",
      external1cId: "PARTNER-1C",
      external1cContractId: "CONTRACT-1C",
      external1cPriceTypeId: "PRICE-TYPE-1C",
    });

    expect(fixtures.partnerCompanyRepository.lastCreateInput).toBeNull();
    expect(fixtures.companyMembershipRepository.lastCreateInput).toBeNull();
    expect(fixtures.accessRequestRepository.lastUpdateInput).toBeNull();
    expect(result.company.id).toBe("company-1");
    expect(result.membership.id).toBe("membership-1");
  });

  it("does not create membership or activate profile when final request approval fails", async () => {
    const fixtures = makeFixtures({ failRequestApproval: true });
    const service = makeService(fixtures);

    await expect(
      service.approveAccessRequest({
        actorUserId: "reviewer-1",
        requestId: "request-1",
        external1cId: "PARTNER-1C",
        external1cContractId: "CONTRACT-1C",
        external1cPriceTypeId: "PRICE-TYPE-1C",
      }),
    ).rejects.toThrow();

    expect(fixtures.partnerCompanyRepository.lastCreateInput).not.toBeNull();
    expect(fixtures.companyMembershipRepository.lastCreateInput).toBeNull();
    expect(fixtures.userProfileRepository.activatedUserId).toBeNull();
  });

  it("does not approve request or activate access when company binding fails", async () => {
    const fixtures = makeFixtures({ failCompanyCreate: true });
    const service = makeService(fixtures);

    await expect(
      service.approveAccessRequest({
        actorUserId: "reviewer-1",
        requestId: "request-1",
        external1cId: "PARTNER-1C",
        external1cContractId: "CONTRACT-1C",
        external1cPriceTypeId: "PRICE-TYPE-1C",
      }),
    ).rejects.toThrow();

    expect(fixtures.accessRequestRepository.lastUpdateInput).toBeNull();
    expect(fixtures.companyMembershipRepository.lastCreateInput).toBeNull();
    expect(fixtures.userProfileRepository.activatedUserId).toBeNull();
  });

  it("keeps approved request but does not activate profile when membership creation fails", async () => {
    const fixtures = makeFixtures({ failMembershipCreate: true });
    const service = makeService(fixtures);

    await expect(
      service.approveAccessRequest({
        actorUserId: "reviewer-1",
        requestId: "request-1",
        external1cId: "PARTNER-1C",
        external1cContractId: "CONTRACT-1C",
        external1cPriceTypeId: "PRICE-TYPE-1C",
      }),
    ).rejects.toThrow();

    expect(fixtures.accessRequestRepository.lastUpdateInput).toMatchObject({
      status: AccessRequestStatus.Approved,
    });
    expect(fixtures.userProfileRepository.activatedUserId).toBeNull();
  });

  it("keeps approved request and membership when profile activation fails for safe retry", async () => {
    const fixtures = makeFixtures({ failProfileActivation: true });
    const service = makeService(fixtures);

    await expect(
      service.approveAccessRequest({
        actorUserId: "reviewer-1",
        requestId: "request-1",
        external1cId: "PARTNER-1C",
        external1cContractId: "CONTRACT-1C",
        external1cPriceTypeId: "PRICE-TYPE-1C",
      }),
    ).rejects.toThrow();

    expect(fixtures.accessRequestRepository.lastUpdateInput).toMatchObject({
      status: AccessRequestStatus.Approved,
    });
    expect(fixtures.companyMembershipRepository.lastCreateInput).toMatchObject({
      status: MembershipStatus.Active,
    });
    expect(fixtures.userProfileRepository.activatedUserId).toBe("partner-1");
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
    existingCompany?: PartnerCompany;
    existingMembership?: CompanyMembership;
    failRequestApproval?: boolean;
    failCompanyCreate?: boolean;
    failMembershipCreate?: boolean;
    failProfileActivation?: boolean;
  } = {},
) {
  const accessRequestRepository = new FakeAccessRequestRepository(
    overrides.request ?? makeAccessRequest(),
    overrides.failRequestApproval ?? false,
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
  }, overrides.failProfileActivation ?? false);

  return {
    accessRequestRepository,
    userProfileRepository,
    partnerCompanyRepository: new FakePartnerCompanyRepository(
      overrides.existingCompany,
      overrides.failCompanyCreate ?? false,
    ),
    companyMembershipRepository: new FakeCompanyMembershipRepository(
      overrides.existingMembership,
      overrides.failMembershipCreate ?? false,
    ),
    rolePermissionRepository: new FakeRolePermissionRepository(),
  };
}

class FakeAccessRequestRepository implements AccessRequestRepository {
  lastUpdateInput: UpdateAccessRequestStatusInput | null = null;
  updateCalls = 0;

  constructor(
    private request: AccessRequest,
    private readonly failApproval = false,
  ) {}

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
    if (this.failApproval && input.status === AccessRequestStatus.Approved) {
      throw new Error("Approval update failed");
    }

    this.updateCalls += 1;
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
  activateCallOrder: number | null = null;

  constructor(
    readonly profiles: Record<string, UserProfile>,
    private readonly failActivation = false,
  ) {}

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
    this.activateCallOrder = 3;

    if (this.failActivation) {
      throw new Error("Profile activation failed");
    }

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
  lastUpdateBindingInput: UpdatePartnerCompanyApprovalBindingInput | null = null;

  constructor(
    private readonly existingCompany?: PartnerCompany,
    private readonly failCreate = false,
  ) {}

  async findById(companyId: string): Promise<PartnerCompany | null> {
    if (this.existingCompany?.id === companyId) {
      return this.existingCompany;
    }

    return null;
  }

  async findByExternal1cId(external1cId: string): Promise<PartnerCompany | null> {
    return this.existingCompany?.external1cId === external1cId
      ? this.existingCompany
      : null;
  }

  async findCompaniesForUser(): Promise<PartnerCompany[]> {
    return [];
  }

  async create(input: CreatePartnerCompanyInput): Promise<PartnerCompany> {
    if (this.failCreate) {
      throw new Error("Company create failed");
    }

    this.lastCreateInput = input;

    return makePartnerCompany({
      external1cId: input.external1cId,
      external1cContractId: input.external1cContractId,
      external1cPriceTypeId: input.external1cPriceTypeId,
      displayName: input.displayName,
    });
  }

  async updateApprovalBinding(
    input: UpdatePartnerCompanyApprovalBindingInput,
  ): Promise<PartnerCompany> {
    this.lastUpdateBindingInput = input;

    return makePartnerCompany({
      ...(this.existingCompany ?? {}),
      id: input.companyId,
      external1cContractId: input.external1cContractId,
      external1cPriceTypeId: input.external1cPriceTypeId,
      displayName: input.displayName ?? this.existingCompany?.displayName,
    });
  }
}

class FakeCompanyMembershipRepository implements CompanyMembershipRepository {
  lastCreateInput: CreateCompanyMembershipInput | null = null;
  createCallOrder: number | null = null;

  constructor(
    private readonly existingMembership?: CompanyMembership,
    private readonly failCreate = false,
  ) {}

  async findByUserId(): Promise<CompanyMembership[]> {
    return [];
  }

  async findActiveMembership(
    userId: string,
    companyId: string,
  ): Promise<CompanyMembership | null> {
    return this.existingMembership?.userId === userId &&
      this.existingMembership.companyId === companyId &&
      this.existingMembership.status === MembershipStatus.Active
      ? this.existingMembership
      : null;
  }

  async create(input: CreateCompanyMembershipInput): Promise<CompanyMembership> {
    if (this.failCreate) {
      throw new Error("Membership create failed");
    }

    this.lastCreateInput = input;
    this.createCallOrder = 2;

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
  async findRoleById(): Promise<Role | null> {
    return this.findRoleByCode();
  }

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
