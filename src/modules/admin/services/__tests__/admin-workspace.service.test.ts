import { describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/src/modules/access-control/actions/service-factory", () => ({
  getAuthenticatedUser: vi.fn(),
}));

import { toAdminWorkspaceContext } from "../admin-workspace.service";

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
});
