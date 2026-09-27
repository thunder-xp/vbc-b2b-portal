import { describe, expect, it, vi } from "vitest";

import type { ExchangeRateProvider, OneCCommercialRateSnapshot } from "../../providers/one-c";
import { ExchangeRateSyncService, type ExchangeRatePublisher } from "../exchange-rate-sync";

const snapshot: OneCCommercialRateSnapshot = {
  generatedAt: "2026-09-27T09:59:00Z",
  rates: [
    { purpose: "partner_price_usd_to_mdl", currencyReference: "d5303dea-f2f5-11ec-4f83-7239d3b7bd5c", code: "113", symbolicCode: "BCRU", rate: "17.5876", multiplicity: "1", normalizedRate: "17.5876", effectiveAt: "2026-09-26T00:00:00+03:00", dataVersion: "v113" },
    { purpose: "retail_price_usd_to_mdl", currencyReference: "94f0e33e-45d7-11ea-8111-000c29cf9dd4", code: "999", symbolicCode: "BCR", rate: "18.0105", multiplicity: "1", normalizedRate: "18.0105", effectiveAt: "2026-09-26T00:00:00+03:00", dataVersion: "v999" },
  ],
};

describe("ExchangeRateSyncService", () => {
  it("records an attempt and publishes the two-purpose snapshot through one boundary", async () => {
    const provider: ExchangeRateProvider = { fetchCommercialRates: vi.fn(async () => snapshot) };
    const publisher = fakePublisher("published", 2);
    const result = await new ExchangeRateSyncService(provider, publisher).sync("00000000-0000-4000-8000-000000000001");
    expect(result).toMatchObject({ outcome: "published", publishedCount: 2 });
    expect(publisher.start).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledWith(snapshot, "00000000-0000-4000-8000-000000000001");
  });

  it("preserves no-op and records bounded failure state", async () => {
    await expect(new ExchangeRateSyncService({ fetchCommercialRates: async () => snapshot }, fakePublisher("no_op", 0)).sync()).resolves.toMatchObject({ outcome: "no_op", publishedCount: 0 });
    const publisher = fakePublisher("no_op", 0);
    await expect(new ExchangeRateSyncService({ fetchCommercialRates: async () => { throw Object.assign(new Error("down"), { category: "TIMEOUT" }); } }, publisher).sync()).rejects.toThrow("down");
    expect(publisher.fail).toHaveBeenCalledWith(expect.any(String), "ONE_C_TIMEOUT", expect.any(String));
  });
});

function fakePublisher(outcome: "published" | "no_op", publishedCount: number): ExchangeRatePublisher & { start: ReturnType<typeof vi.fn>; publish: ReturnType<typeof vi.fn>; fail: ReturnType<typeof vi.fn> } {
  return {
    start: vi.fn(async () => undefined),
    publish: vi.fn(async () => ({ outcome, publishedCount, checkedAt: snapshot.generatedAt, rates: [] })),
    fail: vi.fn(async () => undefined),
  };
}
