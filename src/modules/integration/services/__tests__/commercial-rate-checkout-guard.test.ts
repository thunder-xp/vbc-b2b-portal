import { describe, expect, it, vi } from "vitest";

import type { ExchangeRateSyncService } from "../../sync";
import {
  CommercialRateCheckoutGuard,
  type CommercialRateEvidenceReader,
} from "../commercial-rate-checkout-guard";

const now = new Date("2026-09-27T10:00:00.000Z");

describe("CommercialRateCheckoutGuard", () => {
  it("accepts a recent automatic source check without a request-path 1C call", async () => {
    const sync = syncService();
    const reader = vi.fn<CommercialRateEvidenceReader>(async () => evidence("rate-a", "2026-09-27T09:55:00.000Z"));

    await expect(new CommercialRateCheckoutGuard(sync, () => now, reader).ensureFresh()).resolves.toEqual({
      retailRateId: "rate-a",
      checkedAt: "2026-09-27T09:55:00.000Z",
      refreshed: false,
    });
    expect(sync.sync).not.toHaveBeenCalled();
    expect(reader).toHaveBeenCalledOnce();
  });

  it("performs one targeted refresh and returns the new governed rate identity", async () => {
    const sync = syncService();
    const reader = vi.fn<CommercialRateEvidenceReader>()
      .mockResolvedValueOnce(evidence("rate-a", "2026-09-27T09:40:00.000Z"))
      .mockResolvedValueOnce(evidence("rate-b", "2026-09-27T09:59:00.000Z"));

    await expect(new CommercialRateCheckoutGuard(sync, () => now, reader).ensureFresh()).resolves.toEqual({
      retailRateId: "rate-b",
      checkedAt: "2026-09-27T09:59:00.000Z",
      refreshed: true,
    });
    expect(sync.sync).toHaveBeenCalledOnce();
    expect(reader).toHaveBeenLastCalledWith("evidence_read");
  });

  it("fails closed when the targeted source refresh fails", async () => {
    const sync = syncService();
    sync.sync.mockRejectedValue(new Error("1C unavailable"));
    const reader = vi.fn<CommercialRateEvidenceReader>(async () => evidence("rate-a", "2026-09-27T09:40:00.000Z"));

    await expect(new CommercialRateCheckoutGuard(sync, () => now, reader).ensureFresh()).rejects.toMatchObject({
      name: "CommercialRateFreshnessError",
      stage: "targeted_refresh",
    });
    expect(sync.sync).toHaveBeenCalledOnce();
    expect(reader).toHaveBeenCalledOnce();
  });

  it("fails closed when a completed refresh still lacks fresh evidence", async () => {
    const sync = syncService();
    const reader = vi.fn<CommercialRateEvidenceReader>(async () => evidence("rate-a", "2026-09-27T09:40:00.000Z"));

    await expect(new CommercialRateCheckoutGuard(sync, () => now, reader).ensureFresh()).rejects.toMatchObject({
      name: "CommercialRateFreshnessError",
      stage: "evidence_read",
    });
    expect(sync.sync).toHaveBeenCalledOnce();
    expect(reader).toHaveBeenCalledTimes(2);
  });
});

function evidence(retailRateId: string, checkedAt: string) {
  return { retailRateId, checkedAt };
}

function syncService() {
  return {
    sync: vi.fn(async () => ({ outcome: "no_op", publishedCount: 0, checkedAt: now.toISOString(), rates: [] })),
  } as unknown as ExchangeRateSyncService & { sync: ReturnType<typeof vi.fn> };
}
