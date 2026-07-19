import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  AccessRequestService,
  CompanyAccessService,
  PermissionService,
  UserProfileService,
} from "../../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../../access-control/services";
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
import {
  DefaultPartnerWorkspaceContextService,
  type PartnerPriceTypeReadModel,
} from "../workspace-context.service";

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

  it("keeps workspace access available when the local price-type mapping is unavailable", async () => {
    const context = await service({ priceTypeUnavailable: true }).getWorkspaceContext("partner-1");

    expect(context.accessState).toBe("active");
    expect(context.priceTypeName).toBeNull();
  });

  it("resolves the price type only from the local read model", async () => {
    const findName = vi.fn(async () => "GOLD");
    const context = await service({ priceTypeReadModel: { findName } }).getWorkspaceContext("partner-1");

    expect(context.priceTypeName).toBe("GOLD");
    expect(findName).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333");
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

  it("blocks an inactive company", async () => {
    const context = await service({ company: company({ status: CompanyStatus.Suspended }) }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("suspended");
  });

  it("blocks a suspended profile", async () => {
    const context = await service({ profile: profile({ status: UserStatus.Suspended }) }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("suspended");
  });

  it("returns a controlled state for missing membership", async () => {
    const context = await service({ memberships: [], requests: [request(AccessRequestStatus.Approved)] }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("missing_membership");
  });

  it("does not require an exact approved-request company binding at runtime", async () => {
    const approvedForAnotherCompany = {
      ...request(AccessRequestStatus.Approved),
      companyId: "company-2",
    };
    const context = await service({ requests: [approvedForAnotherCompany] }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("active");
  });

  it("does not let a historical approved request with null company block active access", async () => {
    const historicalRequest = { ...request(AccessRequestStatus.Approved), companyId: null };
    const context = await service({ requests: [historicalRequest] }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("active");
  });

  it("does not query onboarding history for an active membership", async () => {
    const context = await service({ accessRequestLookupFails: true }).getWorkspaceContext("partner-1");
    expect(context.accessState).toBe("active");
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
    expect(context.capabilities.productCard.showPrice).toBe(false);
    expect(context.capabilities.productCard.showStock).toBe(false);
  });

  it("routes internal users away from partner context", async () => {
    const context = await service({ profile: profile({ userType: UserType.Internal }) }).getWorkspaceContext("internal-1");
    expect(context.accessState).toBe("internal");
    expect(context.companyId).toBeNull();
  });
});

describe("assigned partner price-type RLS", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260719130000_partner_assigned_price_type_read.sql"),
    "utf8",
  );

  it("allows only the assigned type through active company membership", () => {
    expect(migration).toContain("company.external_1c_price_type_id = price_types.external_ref");
    expect(migration).toContain("public.has_active_company_membership(company.id)");
    expect(migration).toContain("company.status = 'active'");
    expect(migration).not.toContain("using (true)");
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
  accessRequestLookupFails?: boolean;
  priceTypeUnavailable?: boolean;
  priceTypeReadModel?: PartnerPriceTypeReadModel;
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
    async getOwnAccessRequests() {
      if (fixtures.accessRequestLookupFails) throw new Error("onboarding history unavailable");
      return currentRequests;
    },
    async cancelOwnPendingRequest() { return currentRequests[0]!; },
  };
  const companyAccessService: CompanyAccessService = {
    async getOwnMemberships() { return currentMemberships; },
    async getActiveCompanyContext() {
      if (fixtures.companyMissing) throw new NotFoundError("missing company");
      if (currentCompany.status !== CompanyStatus.Active) throw new InvalidStateError("inactive company");
      return { user: currentProfile, company: currentCompany, membership: currentMemberships[0]! };
    },
    async validateCompanyAccess() { return { isAllowed: true, context: null }; },
    async ensureActiveMembership() { return currentMemberships[0]!; },
  };
  const permissionService: PermissionService = {
    async getRole() { return { id: "role-1", code: "partner_owner", name: "Владелец компании", scope: RoleScope.Partner, createdAt: now }; },
    async getRolePermissions() {
      if (fixtures.hasCommercialPermission === false) return [];
      return ["catalog.view", "prices.view", "stock.view", "orders.create", "documents.view_company"].map((code) => ({ id: code, code, description: null, createdAt: now }));
    },
    async hasPermission() { return fixtures.hasCommercialPermission ?? true; },
    async ensurePermission(_userId, _companyId, permissionCode) { return { isAllowed: true, permissionCode, context: null }; },
  };
  const priceTypeReadModel: PartnerPriceTypeReadModel = fixtures.priceTypeReadModel ?? {
    async findName() { return fixtures.priceTypeUnavailable ? null : "GOLD"; },
  };

  return new DefaultPartnerWorkspaceContextService(
    userProfileService,
    accessRequestService,
    companyAccessService,
    permissionService,
    priceTypeReadModel,
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
