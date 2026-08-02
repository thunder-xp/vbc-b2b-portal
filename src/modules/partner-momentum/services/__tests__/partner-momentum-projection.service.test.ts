import { describe, expect, it, vi } from "vitest";

import type { PartnerMomentumProjectionRepository } from "../../repositories";
import type { MomentumSource } from "../../types";
import { PartnerMomentumProjectionService } from "../partner-momentum-projection.service";

describe("PartnerMomentumProjectionService", () => {
  it("publishes bounded dirty companies without N+1 product reads", async () => {
    const repository = fixtureRepository();
    const result = await new PartnerMomentumProjectionService(repository).process(20);
    expect(repository.claim).toHaveBeenCalledWith(20);
    expect(repository.loadSource).toHaveBeenCalledTimes(1);
    expect(repository.publish).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ processed: 1, published: 1, failures: 0, orderRowsScanned: 3 });
  });

  it("preserves the previous snapshot and releases the dirty key on failure", async () => {
    const repository = fixtureRepository();
    vi.mocked(repository.publish).mockRejectedValueOnce(new Error("db"));
    const result = await new PartnerMomentumProjectionService(repository).process();
    expect(result.failures).toBe(1);
    expect(repository.fail).toHaveBeenCalledWith(expect.any(String), "Error");
  });

  it("enqueues the daily eligible-company refresh separately", async () => {
    const repository = fixtureRepository();
    expect(await new PartnerMomentumProjectionService(repository).enqueueAll()).toBe(1);
  });
});

function fixtureRepository(): PartnerMomentumProjectionRepository {
  const companyId = "00000000-0000-4000-8000-000000000001";
  const source: MomentumSource = {
    companyId, companyActive: true, assignedManagerId: null, sourceFingerprint: "source", now: "2026-08-02T12:00:00.000Z",
    orders: ["2026-01-01", "2026-04-01", "2026-07-01"].map((date, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, orderedAt: `${date}T10:00:00.000Z`, total: 100, currency: "USD", units: 1, productIds: ["a"] })),
    intent: { activeCart: false, templateCount: 0, purchasingListCount: 0, opportunityCount: 0, campaignCount: 0 }, previous: null, orderRowsScanned: 3, sourceTruncated: false,
  };
  return {
    enqueueAll: vi.fn().mockResolvedValue(1), claim: vi.fn().mockResolvedValue([companyId]), loadSource: vi.fn().mockResolvedValue(source),
    publish: vi.fn().mockResolvedValue({ snapshotId: "00000000-0000-4000-8000-000000000010", transitionCreated: 1 }), fail: vi.fn().mockResolvedValue(undefined),
  };
}

