import { describe, expect, it, vi } from "vitest";

import type { CompanyAccessService } from "../../../access-control/services";
import { MembershipStatus } from "../../../access-control/types";
import type { MerchandisingRepository } from "../../repositories";
import { MerchandisingService, MerchandisingValidationError } from "../merchandising.service";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

describe("MerchandisingService", () => {
  it("requires expiry for HOT and manual NEW", () => {
    const service = createService();
    expect(() => service.manage({
      operation: "assign",
      productIds: [PRODUCT_ID],
      labelCode: "HOT",
      reason: "Кампания",
    })).toThrowError(MerchandisingValidationError);
    expect(() => service.manage({
      operation: "assign",
      productIds: [PRODUCT_ID],
      labelCode: "NEW",
      reason: "Новинка",
    })).toThrowError("MERCHANDISING_EXPIRY_REQUIRED");
  });

  it("supports multiple labels and bulk products through independent calls", async () => {
    const repository = repositoryStub();
    const service = createService(repository);
    await service.manage({
      operation: "assign",
      productIds: [PRODUCT_ID],
      labelCode: "TOP",
      reason: "Спрос",
    });
    await service.manage({
      operation: "assign",
      productIds: [PRODUCT_ID],
      labelCode: "HOT",
      endsAt: "2026-08-30T00:00:00.000Z",
      reason: "Промо",
    });
    expect(repository.manage).toHaveBeenCalledTimes(2);
  });

  it("derives company context before published reads", async () => {
    const repository = repositoryStub();
    const access = accessStub();
    const service = new MerchandisingService(repository, access);
    await service.listPublished("user-1", "TOP", 8);
    expect(access.getActiveCompanyContext).toHaveBeenCalledWith(
      "user-1",
      "company-1",
    );
    expect(repository.listPublished).toHaveBeenCalledWith({
      companyId: "company-1",
      labelCode: "TOP",
      limitPerLabel: 8,
    });
  });
});

function createService(repository = repositoryStub()) {
  return new MerchandisingService(repository, accessStub());
}

function repositoryStub(): MerchandisingRepository {
  return {
    listAdminProducts: vi.fn(),
    listPublished: vi.fn().mockResolvedValue([]),
    listPublishedForProducts: vi.fn().mockResolvedValue([]),
    manage: vi.fn().mockResolvedValue(1),
  };
}

function accessStub(): CompanyAccessService {
  return {
    getOwnMemberships: vi.fn().mockResolvedValue([
      { companyId: "company-1", status: MembershipStatus.Active },
    ]),
    getActiveCompanyContext: vi.fn().mockResolvedValue({}),
  } as unknown as CompanyAccessService;
}
