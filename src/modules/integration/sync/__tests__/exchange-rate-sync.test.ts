import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ExchangeRateProvider } from "../../providers/one-c";
import { ExchangeRateSyncService, type ExchangeRatePublisher, type PublishedExchangeRate } from "../exchange-rate-sync";

describe("ExchangeRateSyncService", () => {
  it("applies the confirmed BCRU -1.03 percent adjustment and publishes it", async () => {
    const publisher = new FakePublisher();
    const result = await new ExchangeRateSyncService(provider(16.9337), publisher).sync();

    expect(result.usdMdlRate).toBe(16.9337);
    expect(result.bcruMdlPerUsdRate).toBeCloseTo(16.75928289, 8);
    expect(publisher.input).toMatchObject({ sourceCode: "113", markupPercent: -1.03, bcruMdlPerUsdRate: 16.75928289 });
  });

  it("calculates the confirmed live BCRU rate", async () => {
    const result = await new ExchangeRateSyncService(provider(17.7462), new FakePublisher()).sync();

    expect(result.bcruMdlPerUsdRate).toBeCloseTo(17.56341414, 8);
  });

  it("does not replace a previously published rate when publication fails", async () => {
    const publisher = new FailingPublisher(published(17.1));

    await expect(new ExchangeRateSyncService(provider(16.9337), publisher).sync()).rejects.toThrow("database unavailable");
    expect(publisher.current.bcruMdlPerUsdRate).toBe(17.1);
    expect(publisher.publish).toHaveBeenCalledOnce();
  });
});

describe("exchange-rate publication migration", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260713090000_commercial_exchange_rate_publication.sql"), "utf8");

  it("publishes and retires the old rate inside one database function", () => {
    expect(sql).toContain("create or replace function public.publish_commercial_exchange_rate");
    expect(sql).toContain("insert into public.commercial_exchange_rates");
    expect(sql).toContain("set is_published = false");
    expect(sql).toContain("grant execute on function public.publish_commercial_exchange_rate");
    expect(sql).not.toMatch(/grant execute[^;]+authenticated/i);
  });
});

function provider(rate: number): ExchangeRateProvider { return { fetchLatestUsdRate: async () => ({ source: "Document_ПриходнаяНакладная", documentDate: "2026-06-26T10:00:00.000Z", mdlPerUsdRate: rate }) }; }
function published(rate: number): PublishedExchangeRate { return { id: "rate-1", sourceCode: "113", sourceRef: "d5303dea-f2f5-11ec-4f83-7239d3b7bd5c", sourceDocumentType: "Document_ПриходнаяНакладная", sourceDocumentDate: "2026-06-26T10:00:00.000Z", usdMdlRate: 17.2, bcruMdlPerUsdRate: rate, markupPercent: -1.03, publishedAt: "2026-07-13T08:16:00.000Z" }; }
class FakePublisher implements ExchangeRatePublisher { input: Omit<PublishedExchangeRate, "id" | "publishedAt"> | null = null; async publish(input: Omit<PublishedExchangeRate, "id" | "publishedAt">) { this.input = input; return { id: "rate-1", publishedAt: "2026-07-13T08:16:00.000Z", ...input }; } }
class FailingPublisher implements ExchangeRatePublisher {
  readonly publish = vi.fn(async (_input: Omit<PublishedExchangeRate, "id" | "publishedAt">): Promise<PublishedExchangeRate> => {
    throw new Error("database unavailable");
  });

  constructor(readonly current: PublishedExchangeRate) {}
}
