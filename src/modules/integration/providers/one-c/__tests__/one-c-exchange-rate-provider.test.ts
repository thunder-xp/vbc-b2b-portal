import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OneCExchangeRateProvider,
  ONE_C_EXCHANGE_RATE_DOCUMENT,
  ONE_C_USD_REF,
} from "../one-c-exchange-rate-provider";

describe("OneCExchangeRateProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("queries only receipt documents using the confirmed unfiltered contract", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => response([]));
    vi.stubGlobal("fetch", fetchMock);

    await provider().fetchLatestUsdRate();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [input] = fetchMock.mock.calls[0];
    const url = new URL(String(input));
    expect(decodeURIComponent(url.pathname)).toContain(ONE_C_EXCHANGE_RATE_DOCUMENT);
    expect(url.searchParams.has("$filter")).toBe(false);
    expect(url.searchParams.get("$orderby")).toBe("Date desc");
    expect(url.searchParams.get("$top")).toBe("100");
    expect(url.searchParams.get("$select")).toBe(
      "Date,Number,Posted,DeletionMark,ВалютаДокумента_Key,Курс,Кратность",
    );
  });

  it("selects the newest valid non-future receipt row", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response([
      row({ Date: "2026-07-31T10:00:00", Number: "FUTURE", Курс: 17.4215 }),
      row({ Date: "2018-07-17T10:00:00", Number: "OLDER", Курс: 16.8 }),
      row({ Date: "2026-06-26T10:00:00", Number: "NSUU-000405", Курс: 17.7462 }),
    ])));

    await expect(provider().fetchLatestUsdRate()).resolves.toEqual({
      source: "Document_ПриходнаяНакладная",
      documentDate: "2026-06-26T10:00:00",
      mdlPerUsdRate: 17.7462,
    });
  });

  it.each([
    ["unposted", { Posted: false }],
    ["deleted", { DeletionMark: true }],
    ["non-USD", { ВалютаДокумента_Key: "11111111-1111-4111-8111-111111111111" }],
    ["zero rate", { Курс: 0 }],
    ["zero multiplicity", { Кратность: 0 }],
  ])("ignores %s rows", async (_name, overrides) => {
    vi.stubGlobal("fetch", vi.fn(async () => response([row(overrides)])));

    await expect(provider().fetchLatestUsdRate()).resolves.toBeNull();
  });

  it("accepts an empty receipt-document result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response([])));

    await expect(provider().fetchLatestUsdRate()).resolves.toBeNull();
  });

  it("normalizes Курс by Кратность", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response([
      row({ Курс: 35.4924, Кратность: 2 }),
    ])));

    await expect(provider().fetchLatestUsdRate()).resolves.toMatchObject({
      mdlPerUsdRate: 17.7462,
    });
  });

  it("accepts the live numeric-string multiplicity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response([
      row({ Курс: 17.7462, Кратность: "1" }),
    ])));

    await expect(provider().fetchLatestUsdRate()).resolves.toMatchObject({
      mdlPerUsdRate: 17.7462,
    });
  });
});

function provider() {
  return new OneCExchangeRateProvider(
    {
      baseUrl: "https://erp.example/odata",
      username: "user",
      password: "secret",
      requestTimeoutMs: 1000,
    },
    () => new Date("2026-07-13T12:00:00Z"),
  );
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    Date: "2026-06-26T10:00:00",
    Number: "NSUU-000405",
    Posted: true,
    DeletionMark: false,
    ВалютаДокумента_Key: ONE_C_USD_REF,
    Курс: 17.7462,
    Кратность: 1,
    ...overrides,
  };
}

function response(value: unknown[]) {
  return Promise.resolve(new Response(JSON.stringify({ value }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
}
