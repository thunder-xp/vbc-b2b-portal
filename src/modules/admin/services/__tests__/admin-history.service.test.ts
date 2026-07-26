import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AdminHistoryRepository } from "../../repositories";
import { AdminHistoryService } from "../admin-history.service";

const repository = {
  list: vi.fn().mockResolvedValue({
    records: [],
    page: 1,
    pageSize: 25,
    totalCount: 0,
    totalPages: 1,
  }),
} satisfies AdminHistoryRepository;

const service = new AdminHistoryService(repository);
const companyId = "0b39f044-1f13-4aa0-a83b-cf4d8bc5f87e";
const userId = "c650a149-73e7-4db1-aab8-cac5e7987211";

describe("AdminHistoryService", () => {
  it("loads company history through one bounded repository call", async () => {
    await service.listCompany(companyId, "2");
    expect(repository.list).toHaveBeenLastCalledWith({
      companyId,
      page: 2,
      pageSize: 25,
    });
  });

  it("loads user history without manufacturing a company context", async () => {
    await service.listUser(userId);
    expect(repository.list).toHaveBeenLastCalledWith({
      userId,
      page: 1,
      pageSize: 25,
    });
  });

  it("rejects malformed audit contexts before repository access", () => {
    expect(() => service.listUser("not-a-user")).toThrow(
      "Audit context is invalid",
    );
  });
});
