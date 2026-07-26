import { describe, expect, it, vi } from "vitest";

import type { AdminIdentityRepository } from "../../repositories";
import { AdminIdentityService } from "../admin-identity.service";

describe("AdminIdentityService", () => {
  it("uses one aggregate read for users and normalizes input", async () => {
    const repository = makeRepository();
    const service = new AdminIdentityService(repository);

    await service.listUsers({
      page: "0",
      search: `  ${"u".repeat(120)} `,
      filter: "invalid",
    });

    expect(repository.listUsers).toHaveBeenCalledOnce();
    expect(repository.listUsers).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      search: "u".repeat(100),
      filter: "all",
    });
    expect(repository.listInvitations).not.toHaveBeenCalled();
  });

  it("uses one aggregate read for invitations", async () => {
    const repository = makeRepository();
    const service = new AdminIdentityService(repository);

    await service.listInvitations({ page: "2", filter: "pending" });

    expect(repository.listInvitations).toHaveBeenCalledOnce();
    expect(repository.listInvitations).toHaveBeenCalledWith({
      page: 2,
      pageSize: 25,
      search: "",
      filter: "pending",
    });
  });
});

function makeRepository(): AdminIdentityRepository {
  return {
    listUsers: vi.fn().mockResolvedValue({
      records: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 1,
      search: "",
      filter: "all",
    }),
    listInvitations: vi.fn().mockResolvedValue({
      records: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 1,
      search: "",
      filter: "all",
    }),
  };
}
