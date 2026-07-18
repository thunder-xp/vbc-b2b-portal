import { describe, expect, it, vi } from "vitest";

import type { RolePermissionRepository } from "../../../repositories";
import {
  CompanyStatus,
  MembershipStatus,
  RoleScope,
  UserStatus,
  UserType,
} from "../../../types";
import type { CompanyAccessService } from "../../company-access.service";
import { ForbiddenError } from "../../errors";
import { DefaultPermissionService } from "../permission.service.impl";

const now = "2026-07-18T00:00:00.000Z";

describe("DefaultPermissionService effective permission resolution", () => {
  it("uses the validated membership role and one effective permission read", async () => {
    const repository = repositoryStub();
    const access = accessServiceStub();
    const service = new DefaultPermissionService(repository, access);

    await expect(service.hasPermission("user-1", "company-1", "orders.manage"))
      .resolves.toBe(true);

    expect(access.getActiveCompanyContext).toHaveBeenCalledOnce();
    expect(repository.findPermissionsByRoleId).toHaveBeenCalledOnce();
    expect(repository.userHasPermission).not.toHaveBeenCalled();
  });

  it("preserves inactive or cross-company access denial", async () => {
    const access = accessServiceStub();
    vi.mocked(access.getActiveCompanyContext).mockRejectedValueOnce(new ForbiddenError());
    const service = new DefaultPermissionService(repositoryStub(), access);

    await expect(service.ensurePermission("user-1", "other-company", "orders.manage"))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});

function repositoryStub(): RolePermissionRepository {
  return {
    findRoleById: vi.fn(async () => ({
      id: "role-1", code: "partner", name: "Partner", scope: RoleScope.Partner, createdAt: now,
    })),
    findRoleByCode: vi.fn(async () => null),
    findPermissionsByRoleId: vi.fn(async () => [{
      id: "permission-1", code: "orders.manage", description: null, createdAt: now,
    }]),
    userHasPermission: vi.fn(async () => false),
  };
}

function accessServiceStub(): CompanyAccessService {
  const context = {
    user: {
      id: "user-1", email: "partner@example.com", fullName: null, phone: null,
      status: UserStatus.Active, userType: UserType.Partner, createdAt: now, updatedAt: now,
    },
    company: {
      id: "company-1", external1cId: "external-company", external1cCode: null,
      external1cContractId: null, external1cPriceTypeId: null, displayName: "Company",
      status: CompanyStatus.Active, createdAt: now, updatedAt: now,
    },
    membership: {
      id: "membership-1", userId: "user-1", companyId: "company-1", roleId: "role-1",
      status: MembershipStatus.Active, approvedBy: null, approvedAt: null,
      revokedBy: null, revokedAt: null,
      createdAt: now, updatedAt: now,
    },
  };
  return {
    getOwnMemberships: vi.fn(async () => [context.membership]),
    getActiveCompanyContext: vi.fn(async () => context),
    validateCompanyAccess: vi.fn(async () => ({ isAllowed: true, context })),
    ensureActiveMembership: vi.fn(async () => context.membership),
  };
}
