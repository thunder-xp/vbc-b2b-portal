import { afterEach, describe, expect, it, vi } from "vitest";
import { OneCPriceChunkProvider } from "../one-c-price-chunk-provider";

describe("OneCPriceChunkProvider", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses the verified bounded price query and returns one page only", async () => {
    const fetchMock = vi.fn<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ value: [priceRow] }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider().fetchPrices(1500, 500);
    const request = new URL(String(fetchMock.mock.calls[0][0]));
    expect(request.searchParams.get("$top")).toBe("500");
    expect(request.searchParams.get("$skip")).toBe("1500");
    expect(request.searchParams.get("$orderby")).toBe("Period asc,\u0412\u0438\u0434\u0426\u0435\u043d_Key asc,\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430_Key asc,\u0425\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0430_Key asc,\u0415\u0434\u0438\u043d\u0438\u0446\u0430\u0418\u0437\u043c\u0435\u0440\u0435\u043d\u0438\u044f asc,\u0412\u043a\u043b\u044e\u0447\u0430\u044f\u0425\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0438 asc,\u0426\u0435\u043d\u0430 asc,\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c asc");
    expect(request.searchParams.get("$filter")).toBeNull();
    expect(result).toMatchObject({ rowCount: 1, items: [{ amount: 125, isCurrent: false }] });
  });

  it.each([
    [true, true],
    [false, false],
    [undefined, null],
  ])("projects authoritative price-type VAT %s as %s", async (source, expected) => {
    const row = {
      Ref_Key: "11111111-1111-4111-8111-111111111111",
      Code: "PT",
      Description: "Partner",
      DataVersion: "v1",
      "ВалютаЦены_Key": "22222222-2222-4222-8222-222222222222",
      DeletionMark: false,
      ...(source === undefined ? {} : { "ЦенаВключаетНДС": source }),
    };
    const fetchMock = vi.fn<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ value: [row] }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().fetchPriceTypes(0, 500);
    const request = new URL(String(fetchMock.mock.calls[0][0]));
    expect(request.searchParams.get("$select")).toContain("ЦенаВключаетНДС");
    expect(result.items[0]).toMatchObject({ vatIncluded: expected });
  });
});

function provider() { return new OneCPriceChunkProvider({ baseUrl: "https://erp.example/odata/", username: "user", password: "secret", requestTimeoutMs: 10000 }); }
const priceRow = { Period: "2026-01-01T00:00:00Z", "\u0412\u0438\u0434\u0426\u0435\u043d_Key": "11111111-1111-4111-8111-111111111111", "\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430_Key": "22222222-2222-4222-8222-222222222222", "\u0425\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0430_Key": "00000000-0000-0000-0000-000000000000", "\u0426\u0435\u043d\u0430": 125, "\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c": false };
