import { describe, expect, it, vi } from "vitest";
import { buildTargetedCurrentPriceUrl, OneCPriceODataProvider } from "../one-c-price-odata-provider";

const gold = "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c";
const product = "11111111-1111-4111-8111-111111111111";
const currency = "22222222-2222-4222-8222-222222222222";
const zero = "00000000-0000-0000-0000-000000000000";

describe("OneCPriceODataProvider", () => {
  it("scans without a price-type filter and keeps the latest base-product row", async () => {
    const fetchMock = vi.fn().mockImplementation((input: URL | RequestInfo) => { const url = decodeURIComponent(String(input)); if (url.includes("InformationRegister_ЦеныНоменклатуры")) return Promise.resolve(response([
      price("2026-01-01T00:00:00", 100, true, zero), price("2026-02-01T00:00:00", 110, false, zero), price("2026-03-01T00:00:00", 120, true, "33333333-3333-4333-8333-333333333333"),
    ])); if (url.includes("Catalog_ВидыЦен")) return Promise.resolve(response([{ Ref_Key: gold, Code: "GOLD", Description: "GOLD", DeletionMark: false, DataVersion: "v1", ВалютаЦены_Key: currency }])); return Promise.resolve(response([{ Ref_Key: currency, Code: "MDL", Description: "Moldovan leu", DeletionMark: false }])); });
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider().fetchProductPrices({});
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ isActive: false, validFrom: "2026-02-01T00:00:00", money: { amount: 110, currency: "MDL" }, currencyStatus: "resolved", priceTypeCode: "GOLD" });
    const priceUrl = new URL(String(fetchMock.mock.calls.find(([url]) => decodeURIComponent(String(url)).includes("InformationRegister_ЦеныНоменклатуры"))?.[0]));
    expect(priceUrl.searchParams.get("$filter")).toBeNull();
    expect(priceUrl.searchParams.get("$orderby")).toBe("Period asc");
    expect(priceUrl.searchParams.get("$top")).toBe("500");
    expect(priceUrl.searchParams.get("$skip")).toBe("0");
  });

  it("loads current prices for multiple products with one literal bulk request", async () => {
    const secondProduct = "44444444-4444-4444-8444-444444444444";
    const fetchMock = vi.fn().mockResolvedValue(response([
      price("2026-07-01T00:00:00", 100, true, zero),
      price("2026-07-31T00:00:00", 110, true, zero),
      { ...price("2026-07-30T00:00:00", "25.5", true, zero), Номенклатура_Key: secondProduct },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().fetchCurrentProductPrices({
      priceTypeReference: reference(gold, "price-type"),
      productReferences: [reference(product, "product"), reference(secondProduct, "product")],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toEqual([
      expect.objectContaining({ productReference: expect.objectContaining({ externalId: product }), amount: 110 }),
      expect.objectContaining({ productReference: expect.objectContaining({ externalId: secondProduct }), amount: 25.5 }),
    ]);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("$filter=ВидЦен_Key eq guid'");
    expect(url).toContain(`Номенклатура_Key eq guid'${product}' or Номенклатура_Key eq guid'${secondProduct}'`);
    expect(url).not.toContain("%24filter");
    expect(url).not.toContain("+eq+");
  });

  it("builds a bounded targeted URL without generic query encoding", () => {
    const url = buildTargetedCurrentPriceUrl("https://erp.example/odata", gold, [product]);
    expect(url).toContain("&$top=500&$format=json");
    expect(url).toContain(`Характеристика_Key eq guid'${zero}'`);
    expect(url).not.toContain("URLSearchParams");
  });
});

function provider() { return new OneCPriceODataProvider({ baseUrl: "https://erp.example/odata/", username: "user", password: "secret", requestTimeoutMs: 10000 }); }
function response(value: unknown[]) { return new Response(JSON.stringify({ value }), { headers: { "content-type": "application/json" } }); }
function price(Period: string, amount: number | string, active: boolean, characteristic: string) { return { Period, ВидЦен_Key: gold, Номенклатура_Key: product, Характеристика_Key: characteristic, Цена: amount, Актуальность: active, ЕдиницаИзмерения: "", ВключаяХарактеристики: false }; }
function reference(externalId: string, externalType: string) { return { providerCode: "one-c", externalId, externalType }; }
