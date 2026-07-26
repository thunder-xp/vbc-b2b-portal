import { describe, expect, it, vi } from "vitest";

import type { AdminCompanyRepository } from "../../repositories";
import { AdminCompanyService } from "../admin-company.service";

describe("AdminCompanyService", () => {
  it("normalizes pagination, search, and unsupported filters", async () => {
    const repository = makeRepository();
    const service = new AdminCompanyService(repository);

    await service.list({
      page: "-2",
      search: `  ${"x".repeat(120)}  `,
      filter: "unsupported",
    });

    expect(repository.list).toHaveBeenCalledOnce();
    expect(repository.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      search: "x".repeat(100),
      filter: "all",
    });
  });

  it("uses one aggregate repository read for the list", async () => {
    const repository = makeRepository();
    const service = new AdminCompanyService(repository);

    await service.list({ page: "2", filter: "no_active_owner" });

    expect(repository.list).toHaveBeenCalledOnce();
    expect(repository.getOverview).not.toHaveBeenCalled();
  });

  it("rejects malformed company identities before repository access", async () => {
    const repository = makeRepository();
    const service = new AdminCompanyService(repository);

    await expect(service.getOverview("not-a-company")).resolves.toBeNull();
    expect(repository.getOverview).not.toHaveBeenCalled();
  });
});

function makeRepository(): AdminCompanyRepository {
  return {
    list: vi.fn().mockResolvedValue({
      records: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 1,
      search: "",
      filter: "all",
    }),
    getOverview: vi.fn().mockResolvedValue(null),
  };
}
