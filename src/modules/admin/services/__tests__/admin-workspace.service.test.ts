import { describe, expect, it, vi } from "vitest";

import type { InternalPermissionRepository } from "../../repositories/internal-permission.repository";
import type { InternalPermissionProjection } from "../../types";

const ORIGINAL_ENV = process.env;

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/src/modules/access-control/actions/service-factory", () => ({
  getAuthenticatedUser: vi.fn(),
}));

import {
  resolveInternalPostSignInDestination,
  toAdminWorkspaceContext,
} from "../admin-workspace.service";

function projection(
  permissions: readonly string[],
  overrides: Partial<InternalPermissionProjection> = {},
): InternalPermissionProjection {
  return {
    userId: "user-1",
    profileStatus: "active",
    internalRoleCodes: ["test-role"],
    effectivePermissionCodes: permissions,
    isPlatformAdmin: false,
    displayName: "Internal User",
    ...overrides,
  };
}

function repositoryWith(
  value: InternalPermissionProjection | null,
): InternalPermissionRepository {
  return {
    findForCurrentUser: vi.fn(async () => value),
  };
}

describe("admin workspace context", () => {
  it("returns a safe permission-filtered server DTO", () => {
    process.env = {
      ...ORIGINAL_ENV,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_SHA: "abcdef123456",
      VERCEL_DEPLOYMENT_ID: "deployment-1",
    };

    const context = toAdminWorkspaceContext({
      userId: "user-1",
      profileStatus: "active",
      internalRoleCodes: ["novotech_support"],
      effectivePermissionCodes: [
        "admin.dashboard.view",
        "admin.integrations.view",
      ],
      isPlatformAdmin: false,
      displayName: "Support User",
    });

    expect(context).toMatchObject({
      userId: "user-1",
      displayName: "Support User",
      roleCodes: ["novotech_support"],
      environment: "preview",
      commitSha: "abcdef123456",
      deploymentId: "deployment-1",
    });
    expect(
      context.navigation
        .flatMap((group) => group.items)
        .map((item) => item.href),
    ).toEqual([
      "/admin",
      "/admin/integrations",
      "/admin/integrations/jobs",
      "/admin/integrations/1c-health",
      "/admin/integrations/notifications",
      "/admin/integrations/incidents",
    ]);
    expect(JSON.stringify(context)).not.toMatch(
      /service.role|credential|token|password/i,
    );
  });

  it.each(["novotech_admin", "novotech_finance"])(
    "lands active %s identities with dashboard permission on /admin",
    async (roleCode) => {
      const destination = await resolveInternalPostSignInDestination(
        "user-1",
        repositoryWith(
          projection(["admin.dashboard.view", "admin.finance.view"], {
            internalRoleCodes: [roleCode],
          }),
        ),
      );

      expect(destination).toBe("/admin");
    },
  );

  it("uses the first permission-filtered Admin destination when dashboard access is absent", async () => {
    const destination = await resolveInternalPostSignInDestination(
      "user-1",
      repositoryWith(projection(["admin.finance.view"])),
    );

    expect(destination).toBe("/admin/finance");
  });

  it.each([
    ["no canonical internal projection", null],
    ["inactive internal profile", projection(["admin.dashboard.view"], { profileStatus: "inactive" })],
    ["no effective Admin navigation", projection([])],
  ])("fails closed for %s", async (_case, value) => {
    await expect(
      resolveInternalPostSignInDestination("user-1", repositoryWith(value)),
    ).resolves.toBeNull();
  });
});
