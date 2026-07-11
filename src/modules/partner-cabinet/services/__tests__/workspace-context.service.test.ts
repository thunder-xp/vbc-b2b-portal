import { describe, expect, it } from "vitest";

import type {
  AccessRequestService,
  CompanyAccessService,
  PermissionService,
  UserProfileService,
} from "../../../access-control/services";
import { NotFoundError } from "../../../access-control/services";
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
  type UserProfile,
} from "../../../access-control/types";
import type { PartnerLookupService } from "../../../integration/services";
import { DefaultPartnerWorkspaceContextService } from "../workspace-context.service";

describe("DefaultPartnerWorkspaceContextService", () => {
  it("resolves the approved active partner context with role and price type name", async () => {
    const context = await service().getWorkspaceContext("partner-1");

    expect(context).toMatchObject({
      accessState: "active",
      companyName: "Partner Company",
      membershipRole: "Владелец компании",
      external1cCode: "000152",
      priceTypeName: "GOLD",
    });
  });

  it("returns pending approval without company access", async () => {
    const context = await service({ memberships: [], requests: [request(AccessRequestStatus.PendingReview)] }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("pending_approval");
  });

  it("returns a dedicated state when the authenticated user has no profile", async () => {
    const context = await service({ profileMissing: true }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("missing_profile");
  });

  it("blocks rejected profiles", async () => {
    const context = await service({ profile: profile({ status: UserStatus.Rejected }) }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("rejected");
  });

  it("blocks inactive membership", async () => {
    const context = await service({ memberships: [membership({ status: MembershipStatus.Suspended })] }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("suspended");
  });

  it("returns a controlled state for missing membership", async () => {
    const context = await service({ memberships: [], requests: [request(AccessRequestStatus.Approved)] }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("missing_membership");
  });

  it("does not grant access when approval belongs to another company", async () => {
    const approvedForAnotherCompany = {
      ...request(AccessRequestStatus.Approved),
      companyId: "company-2",
    };
    const context = await service({ requests: [approvedForAnotherCompany] }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("missing_membership");
  });

  it("returns a controlled state for missing company", async () => {
    const context = await service({ companyMissing: true }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("missing_company");
  });

  it("requires commercial configuration without exposing the price type GUID as a name", async () => {
    const context = await service({ company: company({ external1cPriceTypeId: null }) }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("missing_price_type");
    expect(context.priceTypeName).toBeNull();
  });

  it("does not advertise commercial access without pricing or stock permission", async () => {
    const context = await service({ hasCommercialPermission: false }).getWorkspaceContext("partner-1");
    expect(context.availableModules.find((module) => module.key === "pricing_inventory")).toMatchObject({
      availability: "coming_soon",
      href: null,
    });
  });

  it("routes internal users away from partner context", async () => {
    const context = await service({ profile: profile({ userType: UserType.Internal }) }).getWorkspaceContext("internal-1");
    expect(context.accessState).toBe("internal");
    expect(context.companyId).toBeNull();
  });
});

type Fixtures = {
  profile?: UserProfile;
  profileMissing?: boolean;
  memberships?: CompanyMembership[];
  requests?: AccessRequest[];
  company?: PartnerCompany;
  companyMissing?: boolean;
  hasCommercialPermission?: boolean;
};

function service(fixtures: Fixtures = {}) {
  const currentProfile = fixtures.profile ?? profile();
  const currentMemberships = fixtures.memberships ?? [membership()];
  const currentRequests = fixtures.requests ?? [request(AccessRequestStatus.Approved)];
  const currentCompany = fixtures.company ?? company();

  const userProfileService: UserProfileService = {
    async getCurrentProfile() { return fixtures.profileMissing ? null : currentProfile; },
    async createProfileAfterSignup() { return currentProfile; },
    async updateOwnProfile() { return currentProfile; },
    async ensureActiveUser() { return currentProfile; },
  };
  const accessRequestService: AccessRequestService = {
    async submitAccessRequest() { return currentRequests[0]!; },
    async getOwnAccessRequests() { return currentRequests; },
    async cancelOwnPendingRequest() { return currentRequests[0]!; },
  };
  const companyAccessService: CompanyAccessService = {
    async getOwnMemberships() { return currentMemberships; },
    async getActiveCompanyContext() {
      if (fixtures.companyMissing) throw new NotFoundError("missing company");
      return { user: currentProfile, company: currentCompany, membership: currentMemberships[0]! };
    },
    async validateCompanyAccess() { return { isAllowed: true, context: null }; },
    async ensureActiveMembership() { return currentMemberships[0]!; },
  };
  const permissionService: PermissionService = {
    async getRole() { return { id: "role-1", code: "partner_owner", name: "Владелец компании", scope: RoleScope.Partner, createdAt: now }; },
    async getRolePermissions() { return []; },
    async hasPermission() { return fixtures.hasCommercialPermission ?? true; },
    async ensurePermission(_userId, _companyId, permissionCode) { return { isAllowed: true, permissionCode, context: null }; },
  };
  const partnerLookupService: PartnerLookupService = {
    async searchPartners() { return { items: [], nextCursor: null }; },
    async getPartnerContracts() { return { items: [], nextCursor: null }; },
    async getPriceType() { return { reference: { providerCode: "one-c", externalId: "price-guid", externalType: "price-type" }, name: "GOLD", currency: "MDL", includesVat: true, type: null, active: true, isDefault: true }; },
    async listPriceTypes() { return { items: [], nextCursor: null }; },
  };

  return new DefaultPartnerWorkspaceContextService(
    userProfileService,
    accessRequestService,
    companyAccessService,
    permissionService,
    partnerLookupService,
  );
}

const now = "2026-07-11T00:00:00.000Z";

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { id: "partner-1", email: "partner@example.com", fullName: "Partner User", phone: null, status: UserStatus.Active, userType: UserType.Partner, createdAt: now, updatedAt: now, ...overrides };
}

function membership(overrides: Partial<CompanyMembership> = {}): CompanyMembership {
  return { id: "membership-1", userId: "partner-1", companyId: "company-1", roleId: "role-1", status: MembershipStatus.Active, approvedBy: "manager-1", approvedAt: now, revokedBy: null, revokedAt: null, createdAt: now, updatedAt: now, ...overrides };
}

function company(overrides: Partial<PartnerCompany> = {}): PartnerCompany {
  return { id: "company-1", external1cId: "f7df2069-884d-11ea-97e0-000c29cf9dd4", external1cCode: "000152", external1cContractId: null, external1cPriceTypeId: "33333333-3333-4333-8333-333333333333", displayName: "Partner Company", status: CompanyStatus.Active, createdAt: now, updatedAt: now, ...overrides };
}

function request(status: AccessRequestStatus): AccessRequest {
  return { id: "request-1", userId: "partner-1", companyId: status === AccessRequestStatus.Approved ? "company-1" : null, requestedExternal1cId: null, requestedCompanyName: "Partner Company", requestedFiscalCode: null, contactPhone: null, message: null, status, reviewedBy: null, reviewedAt: null, decisionReason: null, createdAt: now, updatedAt: now };
}
