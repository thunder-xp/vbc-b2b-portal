import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AdminRoleManagementRepository } from "../../repositories";
import { AdminRoleManagementService } from "../admin-role-management.service";

const repository = {
  assign: vi.fn(),
  revoke: vi.fn(),
} satisfies AdminRoleManagementRepository;

const service = new AdminRoleManagementService(repository);
const userId = "c650a149-73e7-4db1-aab8-cac5e7987211";

describe("AdminRoleManagementService", () => {
  it.each([
    "novotech_admin",
    "novotech_sales",
    "novotech_finance",
    "novotech_support",
    "novotech_content_manager",
  ])("assigns the internal role %s with a normalized reason", async (role) => {
    await service.assign(userId, role, "  Approved by security  ");
    expect(repository.assign).toHaveBeenLastCalledWith(
      userId,
      role,
      "Approved by security",
    );
  });

  it("rejects partner roles from the internal assignment workflow", async () => {
    expect(() =>
      service.assign(userId, "partner_owner", "Approved"),
    ).toThrow("not assignable");
  });

  it("requires a reason before assignment or revocation", async () => {
    expect(() => service.assign(userId, "novotech_sales", " ")).toThrow(
      "reason",
    );
    expect(() => service.revoke(userId, "x")).toThrow("reason");
  });

  it("rejects malformed portal user identities", async () => {
    expect(() =>
      service.assign(
        "not-a-user-id",
        "novotech_sales",
        "Approved",
      ),
    ).toThrow("identity is invalid");
  });
});
