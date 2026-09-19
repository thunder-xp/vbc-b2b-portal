import { afterEach, describe, expect, it, vi } from "vitest";

import type { FinalCustomerProvisioningRepository } from "../repository";
import { FinalCustomerProvisioningService } from "../service";
import type { ClaimedCustomerProvisioningEvent, CustomerProvisioningResult } from "../types";

const claim: ClaimedCustomerProvisioningEvent = {
  eventId: "11111111-1111-4111-8111-111111111111",
  retailOrderId: "22222222-2222-4222-8222-222222222222",
  leaseToken: "33333333-3333-4333-8333-333333333333",
  attemptCount: 1,
};

function result(outcome: CustomerProvisioningResult["outcome"]): CustomerProvisioningResult {
  return {
    outcome,
    customerAccountId: outcome === "NEEDS_REVIEW" ? null : "44444444-4444-4444-8444-444444444444",
    customerIdentityId: outcome === "NEEDS_REVIEW" ? null : "55555555-5555-4555-8555-555555555555",
    entitlementId: outcome === "NEEDS_REVIEW" ? null : "66666666-6666-4666-8666-666666666666",
    oneCJobState: outcome === "NEEDS_REVIEW" ? null : "PENDING",
  };
}

function repository(overrides: Partial<FinalCustomerProvisioningRepository> = {}): FinalCustomerProvisioningRepository {
  return {
    claim: vi.fn().mockResolvedValue([claim]),
    provision: vi.fn().mockResolvedValue(result("CREATED")),
    fail: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.NEW_PURCHASE_PROVISIONING_ENABLED;
  vi.restoreAllMocks();
});

describe("FinalCustomerProvisioningService", () => {
  it("does not claim OTP-only users when the new purchase worker is disabled", async () => {
    process.env.NEW_PURCHASE_PROVISIONING_ENABLED = "false";
    const repo = repository();
    const outcome = await new FinalCustomerProvisioningService(repo).processBatch();
    expect(outcome).toMatchObject({ enabled: false, claimed: 0, created: 0 });
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it("records a first confirmed purchase as one created account", async () => {
    const outcome = await new FinalCustomerProvisioningService(repository()).processBatch();
    expect(outcome).toMatchObject({ enabled: true, claimed: 1, created: 1, reused: 0, retryScheduled: 0 });
  });

  it("reuses an existing account for a later confirmed purchase", async () => {
    const outcome = await new FinalCustomerProvisioningService(repository({
      provision: vi.fn().mockResolvedValue(result("REUSED")),
    })).processBatch();
    expect(outcome).toMatchObject({ claimed: 1, created: 0, reused: 1 });
  });

  it("processes each durable claim once even when the batch contains one logical duplicate", async () => {
    const repo = repository();
    await new FinalCustomerProvisioningService(repo).processBatch();
    expect(repo.provision).toHaveBeenCalledTimes(1);
    expect(repo.provision).toHaveBeenCalledWith(claim);
  });

  it("schedules a bounded retry without blocking other account activations", async () => {
    const second = { ...claim, eventId: "77777777-7777-4777-8777-777777777777" };
    const repo = repository({
      claim: vi.fn().mockResolvedValue([claim, second]),
      provision: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error("unavailable"), { code: "ONE_C_UNAVAILABLE" }))
        .mockResolvedValueOnce(result("CREATED")),
    });
    const outcome = await new FinalCustomerProvisioningService(repo).processBatch();
    expect(outcome).toMatchObject({ claimed: 2, created: 1, retryScheduled: 1 });
    expect(repo.fail).toHaveBeenCalledWith(claim, "ONE_C_UNAVAILABLE");
  });
});
