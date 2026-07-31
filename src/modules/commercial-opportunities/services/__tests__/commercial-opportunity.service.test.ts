import { describe, expect, it, vi } from "vitest";

import type { CommercialOpportunityRepository } from "../../repositories";
import { CommercialOpportunityService } from "../commercial-opportunity.service";

const page = { items: [], totalCount: 0 };

function setup(accessState = "active", companyId: string | null = "company-1") {
  const repository: CommercialOpportunityRepository = { list: vi.fn().mockResolvedValue(page), dismiss: vi.fn().mockResolvedValue(undefined) };
  const workspaceContext = { getWorkspaceContext: vi.fn().mockResolvedValue({ accessState, companyId }) } as never;
  return { repository, service: new CommercialOpportunityService(repository, workspaceContext) };
}

describe("CommercialOpportunityService", () => {
  it("uses one bounded repository read with pagination", async () => {
    const { repository, service } = setup();
    const result = await service.list("user-1", { filter: "arrivals", page: 2, pageSize: 24 });
    expect(repository.list).toHaveBeenCalledOnce();
    expect(repository.list).toHaveBeenCalledWith({ companyId: "company-1", filter: "arrivals", limit: 24, offset: 24 });
    expect(result).toMatchObject({ page: 2, totalPages: 1 });
  });

  it("denies cross-company or inactive workspace access before the repository", async () => {
    const { repository, service } = setup("missing_membership", null);
    await expect(service.list("user-1")).rejects.toThrow("Partner workspace access is not active");
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("dismisses only after canonical workspace authorization", async () => {
    const { repository, service } = setup();
    await service.dismiss("user-1", "opportunity-1");
    expect(repository.dismiss).toHaveBeenCalledWith("opportunity-1");
  });
});
