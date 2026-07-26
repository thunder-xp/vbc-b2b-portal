import { describe, expect, it, vi } from "vitest";

import type {
  EffectivePermissionRepository,
  RolePermissionRepository,
} from "../../../repositories";
import type { EffectivePermissionContext } from "../../../types";
import { RoleScope } from "../../../types";
import { ForbiddenError, PermissionRequiredError } from "../../errors";
import { resolveCommercialVisibility } from "../../permission.service";
import { DefaultPermissionService } from "../permission.service.impl";

const now = "2026-07-25T00:00:00.000Z";

describe("DefaultPermissionService", () => {
  it("derives one immutable retail-only commercial visibility context", () => {
    const context = effectivePermissionContext({
      effectivePermissionCodes: ["pricing.retail_price.view"],
      deniedOverrideCodes: ["pricing.partner_price.view"],
    });

    expect(resolveCommercialVisibility(context)).toEqual({
      userId: "user-1",
      companyId: "company-1",
      mode: "retail_only",
      canViewPartnerPrice: false,
      canViewRetailPrice: true,
      canViewMargin: false,
      canViewPartnerTotals: false,
      canUseCommercialCalculations: false,
    });
    expect(Object.isFrozen(resolveCommercialVisibility(context))).toBe(true);
  });
  it("loads the full effective set in one projection instead of querying one permission", async () => {
    const effectiveRepository = effectiveRepositoryStub();
    const service = new DefaultPermissionService(
      roleRepositoryStub(),
      effectiveRepository,
    );

    await expect(
      service.hasPermission("user-1", "company-1", "orders.manage"),
    ).resolves.toBe(true);
    expect(effectiveRepository.findForCurrentUser).toHaveBeenCalledOnce();
  });

  it("applies the repository projection where explicit deny wins", async () => {
    const effectiveRepository = effectiveRepositoryStub({
      rolePermissionCodes: ["pricing.partner_price.view", "pricing.retail_price.view"],
      deniedOverrideCodes: ["pricing.partner_price.view"],
      effectivePermissionCodes: ["pricing.retail_price.view"],
    });
    const service = new DefaultPermissionService(
      roleRepositoryStub(),
      effectiveRepository,
    );

    await expect(
      service.hasPermission(
        "user-1",
        "company-1",
        "pricing.partner_price.view",
      ),
    ).resolves.toBe(false);
    await expect(
      service.hasPermission(
        "user-1",
        "company-1",
        "pricing.retail_price.view",
      ),
    ).resolves.toBe(true);
  });

  it("rejects a missing, inactive, or cross-company context", async () => {
    const effectiveRepository = effectiveRepositoryStub();
    vi.mocked(effectiveRepository.findForCurrentUser).mockResolvedValue(null);
    const service = new DefaultPermissionService(
      roleRepositoryStub(),
      effectiveRepository,
    );

    await expect(
      service.ensurePermission("user-1", "other-company", "orders.manage"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a permission absent from the effective set", async () => {
    const service = new DefaultPermissionService(
      roleRepositoryStub(),
      effectiveRepositoryStub(),
    );

    await expect(
      service.ensurePermission("user-1", "company-1", "admin.access"),
    ).rejects.toBeInstanceOf(PermissionRequiredError);
  });

  it("accepts a protected internal administrator projection", async () => {
    const service = new DefaultPermissionService(
      roleRepositoryStub(),
      effectiveRepositoryStub({
        membershipId: null,
        membershipStatus: null,
        roleId: null,
        roleCode: "novotech_admin",
        roleName: "Novotech Admin",
        isInternalOverride: true,
        rolePermissionCodes: ["admin.access"],
        effectivePermissionCodes: ["admin.access"],
      }),
    );

    await expect(
      service.hasPermission("user-1", "company-1", "admin.access"),
    ).resolves.toBe(true);
  });
});

function roleRepositoryStub(): RolePermissionRepository {
  return {
    findRoleById: vi.fn(async () => ({
      id: "role-1",
      code: "partner_owner",
      name: "Partner Owner",
      scope: RoleScope.Partner,
      createdAt: now,
    })),
    findRoleByCode: vi.fn(async () => null),
    findPermissionsByRoleId: vi.fn(async () => []),
    userHasPermission: vi.fn(async () => false),
  };
}

function effectiveRepositoryStub(
  overrides: Partial<EffectivePermissionContext> = {},
): EffectivePermissionRepository {
  const context = effectivePermissionContext(overrides);

  return {
    findForCurrentUser: vi.fn(async () => context),
  };
}

function effectivePermissionContext(
  overrides: Partial<EffectivePermissionContext> = {},
): EffectivePermissionContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    profileStatus: "active",
    companyStatus: "active",
    membershipId: "membership-1",
    membershipStatus: "active",
    roleId: "role-1",
    roleCode: "partner_owner",
    roleName: "Partner Owner",
    isInternalOverride: false,
    rolePermissionCodes: ["catalog.view", "orders.manage"],
    allowedOverrideCodes: [],
    deniedOverrideCodes: [],
    effectivePermissionCodes: ["catalog.view", "orders.manage"],
    ...overrides,
  };
}
