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

  it("deduplicates manually selected capabilities before saving", async () => {
    const repository = makeRepository();
    const service = new AdminCompanyService(repository);

    await service.updateAccess({
      companyId: "00000000-0000-0000-0000-000000000001",
      expectedVersion: 1,
      presetCode: "custom",
      enabledPermissionCodes: ["catalog.view", " catalog.view ", "stock.view"],
      note: " Manual restriction ",
      correlationId: "00000000-0000-0000-0000-000000000002",
    });

    expect(repository.updateAccess).toHaveBeenCalledWith(expect.objectContaining({
      enabledPermissionCodes: ["catalog.view", "stock.view"],
      note: "Manual restriction",
    }));
  });

  it("performs one exact contract and price-type read after acquiring the company lease", async () => {
    const repository = makeRepository();
    vi.mocked(repository.beginCommercialProfileSync).mockResolvedValue({
      code: "COMMERCIAL_PROFILE_MISMATCH",
      correlationId: "00000000-0000-0000-0000-000000000002",
      claimed: true,
      runId: "00000000-0000-0000-0000-000000000003",
      counterpartyRef: "00000000-0000-0000-0000-000000000004",
      contractRef: "00000000-0000-0000-0000-000000000005",
    });
    const provider = {
      fetchCommercialProfile: vi.fn().mockResolvedValue({
        counterpartyReference: "00000000-0000-0000-0000-000000000004",
        contractReference: "00000000-0000-0000-0000-000000000005",
      }),
    };
    const service = new AdminCompanyService(repository);

    await service.synchronizeCommercialProfile({
      companyId: "00000000-0000-0000-0000-000000000001",
      expectedVersion: 1,
      reason: "Verified mapped contract refresh",
      correlationId: "00000000-0000-0000-0000-000000000002",
      provider: provider as never,
    });

    expect(provider.fetchCommercialProfile).toHaveBeenCalledOnce();
    expect(repository.publishCommercialProfileSync).toHaveBeenCalledOnce();
    expect(repository.failCommercialProfileSync).not.toHaveBeenCalled();
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
    getAccess: vi.fn().mockResolvedValue(null),
    getContractMapping: vi.fn().mockResolvedValue(null),
    mapContract: vi.fn().mockResolvedValue({
      code: "CONTRACT_MAPPING_SUCCESS",
      correlationId: "00000000-0000-0000-0000-000000000001",
    }),
    beginCommercialProfileSync: vi.fn().mockResolvedValue({
      code: "COMMERCIAL_CONTRACT_MISSING",
      correlationId: "00000000-0000-0000-0000-000000000001",
      claimed: false,
    }),
    publishCommercialProfileSync: vi.fn().mockResolvedValue({
      code: "COMMERCIAL_PROFILE_SYNC_SUCCESS",
      correlationId: "00000000-0000-0000-0000-000000000001",
    }),
    failCommercialProfileSync: vi.fn().mockResolvedValue(undefined),
    updateAccess: vi.fn().mockResolvedValue({
      version: 2,
      correlationId: "00000000-0000-0000-0000-000000000001",
    }),
  };
}
