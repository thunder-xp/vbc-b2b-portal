import { describe, expect, it, vi } from "vitest";

import type { CompanyAccessService } from "../../../access-control/services";
import { MembershipStatus } from "../../../access-control/types";
import type { MerchandisingRepository } from "../../repositories";
import { MerchandisingService, MerchandisingValidationError } from "../merchandising.service";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

describe("MerchandisingService", () => {
  it("rejects system-managed NEW and requires expiry for editable timed labels", () => {
    const service = createService();
    expect(() => service.manage({
      requestId: REQUEST_ID,
      operation: "assign",
      productIds: [PRODUCT_ID],
      labelCode: "HOT",
      reason: "Кампания",
    })).toThrowError(MerchandisingValidationError);
    expect(() => service.manage({
      requestId: REQUEST_ID,
      operation: "assign",
      productIds: [PRODUCT_ID],
      labelCode: "NEW",
      reason: "Новинка",
    })).toThrowError("MERCHANDISING_NEW_SYSTEM_MANAGED");
    expect(() => service.manage({
      requestId: REQUEST_ID,
      operation: "assign",
      productIds: [PRODUCT_ID],
      labelCode: "SPECIAL_OFFER",
      reason: "Розничная акция",
    })).toThrowError("MERCHANDISING_EXPIRY_REQUIRED");
  });

  it("keeps Popular and HOT system-managed while SPECIAL_OFFER remains editable", async () => {
    const repository = repositoryStub();
    const service = createService(repository);
    expect(() => service.manage({
      requestId: REQUEST_ID,
      operation: "assign",
      productIds: [PRODUCT_ID],
      labelCode: "TOP",
      reason: "Спрос",
    })).toThrowError("MERCHANDISING_POPULAR_SYSTEM_MANAGED");
    expect(() => service.manage({
      requestId: "33333333-3333-4333-8333-333333333333",
      operation: "assign",
      productIds: [PRODUCT_ID],
      labelCode: "HOT",
      endsAt: "2026-08-30T00:00:00.000Z",
      reason: "Промо",
    })).toThrowError("MERCHANDISING_HOT_SYSTEM_MANAGED");
    await service.manage({
      requestId: "44444444-4444-4444-8444-444444444444",
      operation: "assign",
      productIds: [PRODUCT_ID],
      labelCode: "SPECIAL_OFFER",
      endsAt: "2026-08-30T00:00:00.000Z",
      reason: "Retail campaign",
    });
    expect(repository.manage).toHaveBeenCalledTimes(1);
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
      popularPeriod: 365,
      newPeriod: 365,
      hotPeriod: 365,
    });
  });

  it("passes a bounded login generation only for stable preview rotation", async () => {
    const repository = repositoryStub();
    const service = createService(repository);
    await service.listPublished(
      "user-1",
      undefined,
      5,
      "2026-09-09T08:30:00.000Z",
    );
    expect(repository.listPublished).toHaveBeenCalledWith({
      companyId: "company-1",
      labelCode: undefined,
      limitPerLabel: 5,
      popularPeriod: 365,
      newPeriod: 365,
      hotPeriod: 365,
      rotationSeed: "2026-09-09T08:30:00.000Z",
    });
  });
});

function createService(repository = repositoryStub()) {
  return new MerchandisingService(repository, accessStub());
}

function repositoryStub(): MerchandisingRepository {
  return {
    refreshB2bPopularity: vi.fn(),
    refreshPartnerCoBuy: vi.fn(),
    listAdminProducts: vi.fn(),
    getAdminPreview: vi.fn().mockResolvedValue({ sections: [] }),
    listPublished: vi.fn().mockResolvedValue([]),
    listPublishedForProducts: vi.fn().mockResolvedValue([]),
    manage: vi.fn().mockResolvedValue({
      affected: 1,
      assignments: [{
        productId: PRODUCT_ID,
        productName: "Product",
        sku: "400669",
        labelCode: "TOP",
      }],
    }),
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
