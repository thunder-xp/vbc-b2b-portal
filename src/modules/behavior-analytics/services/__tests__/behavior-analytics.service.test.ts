import { describe, expect, it, vi } from "vitest";

import type { CompanyAccessService } from "../../../access-control/services";
import { MembershipStatus } from "../../../access-control/types";
import type { BehaviorAnalyticsRepository } from "../../repositories";
import { BehaviorAnalyticsService, BehaviorAnalyticsValidationError } from "../behavior-analytics.service";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("BehaviorAnalyticsService", () => {
  it("derives company context and normalizes search server-side", async () => {
    const repository = repositoryStub();
    const service = new BehaviorAnalyticsService(repository, accessStub());
    await service.record("user-1", {
      eventName: "search_performed",
      route: "/cabinet/catalog?search=Camera",
      searchQuery: "  CAMERA   IP  ",
      sessionId: SESSION_ID,
    });
    expect(repository.record).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        route: "/cabinet/catalog",
        searchQuery: "camera ip",
      }),
    );
  });

  it("rejects unknown events and sensitive metadata", async () => {
    const service = new BehaviorAnalyticsService(repositoryStub(), accessStub());
    await expect(service.record("user-1", {
      eventName: "unknown" as "catalog_viewed",
      route: "/cabinet/catalog",
      sessionId: SESSION_ID,
    })).rejects.toBeInstanceOf(BehaviorAnalyticsValidationError);
    await expect(service.record("user-1", {
      eventName: "catalog_viewed",
      route: "/cabinet/catalog",
      sessionId: SESSION_ID,
      metadataSafe: { priceAmount: 100 },
    })).rejects.toBeInstanceOf(BehaviorAnalyticsValidationError);
  });

  it("has no browser-supplied company field in the recording contract", () => {
    const input = {
      eventName: "catalog_viewed",
      route: "/cabinet/catalog",
      sessionId: SESSION_ID,
    };
    expect(input).not.toHaveProperty("companyId");
  });
});

function repositoryStub(): BehaviorAnalyticsRepository {
  return {
    record: vi.fn().mockResolvedValue("event-1"),
    getAdminPreview: vi.fn(),
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
