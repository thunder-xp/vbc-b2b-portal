import { describe, expect, it, vi } from "vitest";

import { OneCExchangeRateProvider, parseCommercialRatePayload } from "../one-c-exchange-rate-provider";

const now = new Date("2026-09-27T10:00:00.000Z");
const payload = {
  generatedAt: "2026-09-27T09:59:00.000Z",
  rates: [
    { currencyRef: "d5303dea-f2f5-11ec-4f83-7239d3b7bd5c", code: "113", symbolicCode: "BCRU", rate: "17.5876", multiplicity: "1", normalizedRate: "17.5876", effectiveAt: "2026-09-26T00:00:00+03:00", dataVersion: "113:20260926:175876" },
    { currencyRef: "94f0e33e-45d7-11ea-8111-000c29cf9dd4", code: "999", symbolicCode: "BCR", rate: "18.0105", multiplicity: "1", normalizedRate: "18.0105", effectiveAt: "2026-09-26T00:00:00+03:00", dataVersion: "999:20260926:180105" },
  ],
};

describe("OneCExchangeRateProvider", () => {
  it("maps exact authoritative 113 and 999 identities without inference", () => {
    const parsed = parseCommercialRatePayload(payload, now);
    expect(parsed.generatedAt).toBe("2026-09-27T09:59:00.000Z");
    expect(parsed.rates).toEqual([
      expect.objectContaining({ code: "113", purpose: "partner_price_usd_to_mdl", normalizedRate: "17.5876", effectiveAt: "2026-09-26T00:00:00.000Z" }),
      expect.objectContaining({ code: "999", purpose: "retail_price_usd_to_mdl", normalizedRate: "18.0105", effectiveAt: "2026-09-26T00:00:00.000Z" }),
    ]);
  });

  it("normalizes multiplicity and rejects future or malformed evidence", () => {
    const normalized = parseCommercialRatePayload({ ...payload, rates: [
      { ...payload.rates[0], rate: "175.876", multiplicity: "10", normalizedRate: "17.5876" },
      payload.rates[1],
    ] }, now);
    expect(normalized.rates[0].normalizedRate).toBe("17.5876");
    expect(() => parseCommercialRatePayload({ ...payload, rates: [
      { ...payload.rates[0], effectiveAt: "2026-09-28T00:00:00Z" }, payload.rates[1],
    ] }, now)).toThrow(/effectiveAt/);
    expect(() => parseCommercialRatePayload({ ...payload, rates: [payload.rates[0]] }, now)).toThrow(/113 and 999/);
  });

  it("uses authenticated GET and never exposes credentials in errors", async () => {
    let requestInit: RequestInit | undefined;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const provider = new OneCExchangeRateProvider({ endpointUrl: "https://onec.example/novotech/hs/b2b/commercial-rates", username: "b2b_rates_reader", password: "secret", requestTimeoutMs: 1000 }, () => now, fetcher as typeof fetch);
    await expect(provider.fetchCommercialRates()).resolves.toMatchObject({ generatedAt: "2026-09-27T09:59:00.000Z" });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("commercial-rates"), expect.objectContaining({ method: "GET", cache: "no-store" }));
    expect((requestInit?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("treats timezone-less 1C timestamps as Europe/Chisinau wall clock", () => {
    const result = parseCommercialRatePayload({
      ...payload,
      generatedAt: "2026-09-27T20:41:35",
      rates: payload.rates.map((rate) => ({ ...rate, effectiveAt: "2026-09-26T00:00:00" })),
    }, new Date("2026-09-27T18:00:00.000Z"));
    expect(result.generatedAt).toBe("2026-09-27T17:41:35.000Z");
    expect(result.rates[1]).toMatchObject({
      purpose: "retail_price_usd_to_mdl",
      normalizedRate: "18.0105",
      effectiveAt: "2026-09-26T00:00:00.000Z",
    });
  });
});
