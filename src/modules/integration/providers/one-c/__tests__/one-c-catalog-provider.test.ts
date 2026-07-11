import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IntegrationForbiddenError,
  IntegrationHttpError,
  IntegrationProviderUnavailableError,
  IntegrationTimeoutError,
  IntegrationUnauthorizedError,
  IntegrationValidationError,
} from "../../../errors";
import { IntegrationProviderNotImplementedError } from "../one-c-provider";
import {
  DefaultOneCCatalogMapper,
  DefaultOneCInventoryMapper,
  DefaultOneCPartnerMapper,
  DefaultOneCPricingMapper,
  OneCProvider,
} from "../index";
import type {
  OneCCatalogProductPayload,
  OneCPartnerSearchPayload,
  OneCProductPricePayload,
  OneCStockBalancePayload,
} from "../one-c-provider.types";

describe("1C catalog provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps 1C product payloads to neutral catalog DTOs", () => {
    const mapper = new DefaultOneCCatalogMapper();
    const payload: OneCCatalogProductPayload = {
      reference: { ref: "P-1", type: "product" },
      categoryReference: { ref: "C-1", type: "category" },
      brandReference: { ref: "B-1", type: "brand" },
      sku: "SKU-1",
      name: "Outdoor Camera",
      shortDescription: "Short",
      description: "Long",
      imageUrl: null,
      active: true,
      visible: true,
      metadata: { sourceUpdatedAt: "2026-07-09T00:00:00.000Z" },
    };

    const dto = mapper.productMapper.toPlatformDTO(payload);

    expect(dto.reference).toEqual({
      providerCode: "one-c",
      externalId: "P-1",
      externalType: "product",
    });
    expect(dto.categoryReference?.externalId).toBe("C-1");
    expect(dto.brandReference?.externalId).toBe("B-1");
    expect(dto.slug).toBe("outdoor-camera");
    expect(dto.sku).toBe("SKU-1");
  });

  it("uses mock catalog without HTTP configuration", async () => {
    const provider = new OneCProvider({ useMockCatalog: true });

    await expect(provider.catalog.fetchProducts({})).resolves.toMatchObject({
      nextCursor: null,
    });
  });

  it("fails safely when real catalog endpoint is not configured", async () => {
    const provider = new OneCProvider({
      useMockCatalog: false,
      baseUrl: null,
    });

    await expect(provider.catalog.fetchProducts({})).rejects.toBeInstanceOf(
      IntegrationProviderNotImplementedError,
    );
  });

  it("maps 1C price payloads to neutral price DTOs", () => {
    const mapper = new DefaultOneCPricingMapper();
    const payload: OneCProductPricePayload = {
      reference: { ref: "PRICE-1", type: "product-price" },
      productReference: { ref: "PRODUCT-1", type: "catalog-product" },
      partnerCompanyReference: { ref: "PARTNER-1", type: "partner-company" },
      priceTypeReference: { ref: "BASE", type: "price-type" },
      currency: "BGN",
      amount: 123.45,
      validFrom: "2026-07-09T00:00:00.000Z",
      validTo: null,
      active: true,
      metadata: { sourceUpdatedAt: "2026-07-09T00:00:00.000Z" },
    };

    const dto = mapper.priceMapper.toPlatformDTO(payload);

    expect(dto.reference.externalId).toBe("PRICE-1");
    expect(dto.productReference.externalId).toBe("PRODUCT-1");
    expect(dto.partnerCompanyReference?.externalId).toBe("PARTNER-1");
    expect(dto.priceTypeReference?.externalId).toBe("BASE");
    expect(dto.money).toEqual({ currency: "BGN", amount: 123.45 });
  });

  it("uses mock pricing without HTTP configuration", async () => {
    const provider = new OneCProvider({ useMockPricing: true });

    await expect(provider.pricing.fetchProductPrices({})).resolves.toMatchObject(
      {
        nextCursor: null,
      },
    );
  });

  it("maps 1C stock payloads to neutral stock DTOs", () => {
    const mapper = new DefaultOneCInventoryMapper();
    const payload: OneCStockBalancePayload = {
      reference: { ref: "STOCK-1", type: "stock-balance" },
      productReference: { ref: "PRODUCT-1", type: "catalog-product" },
      warehouseReference: { ref: "MAIN", type: "warehouse" },
      warehouseName: "Main warehouse",
      availableQuantity: 4,
      reservedQuantity: 1,
      expectedQuantity: 10,
      expectedAt: "2026-07-20T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-09T00:00:00.000Z",
      active: true,
      metadata: { sourceUpdatedAt: "2026-07-09T00:00:00.000Z" },
    };

    const dto = mapper.toPlatformDTO(payload);

    expect(dto.reference.externalId).toBe("STOCK-1");
    expect(dto.productReference.externalId).toBe("PRODUCT-1");
    expect(dto.warehouseName).toBe("Main warehouse");
    expect(dto.availableQuantity).toBe(4);
    expect(dto.expectedQuantity).toBe(10);
  });

  it("uses mock inventory without HTTP configuration", async () => {
    const provider = new OneCProvider({ useMockInventory: true });

    await expect(provider.inventory.fetchStockBalances({})).resolves.toMatchObject(
      {
        nextCursor: null,
      },
    );
  });

  it("maps 1C partner search payloads to neutral partner DTOs", () => {
    const mapper = new DefaultOneCPartnerMapper();
    const payload: OneCPartnerSearchPayload = {
      Ref_Key: "11111111-1111-4111-8111-111111111111",
      Code: "PARTNER-1",
      Description: "Security Partner",
      НаименованиеПолное: "Security Partner SRL",
      ИНН: "BG123456789",
      Покупатель: true,
      Поставщик: false,
      Недействителен: false,
      DeletionMark: false,
      IsFolder: false,
    };

    const dto = mapper.toSearchResultDTO(payload);

    expect(dto.reference.externalId).toBe("11111111-1111-4111-8111-111111111111");
    expect(dto.code).toBe("PARTNER-1");
    expect(dto.buyer).toBe(true);
  });

  it("uses mock partner search without HTTP configuration", async () => {
    const provider = new OneCProvider({ useMockPartners: true });

    const result = await provider.partners.searchPartners({
      query: "1018600013048",
    });

    expect(result.items[0]).toMatchObject({
      displayName: "Novotech Demo Partner",
      taxId: "1018600013048",
    });
  });

  it("calls the real partner search endpoint with bearer auth and encoded query", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          "odata.metadata": "metadata",
          value: [
            {
              Ref_Key: "11111111-1111-4111-8111-111111111111",
              Code: "000000152",
              Description: "NOVOTECH SYSTEMS SRL",
              НаименованиеПолное: "NOVOTECH SYSTEMS SRL",
              ИНН: "1018600013048",
              Покупатель: true,
              Поставщик: false,
              Недействителен: false,
              DeletionMark: false,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OneCProvider({
      baseUrl: "https://erp-api.novotech.md",
      username: "odata-user",
      password: "odata-password",
      requestTimeoutMs: 10000,
      useMockPartners: false,
    });

    const result = await provider.partners.searchPartners({
      query: "NOVOTECH SYSTEMS",
    });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(decodeURIComponent(url.toString())).toContain("Catalog_Контрагенты");
    expect(url.searchParams.get("$filter")).toBe("Code eq 'NOVOTECH SYSTEMS'");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from("odata-user:odata-password").toString("base64")}`,
    });
    expect(result.items[0]).toMatchObject({
      displayName: "NOVOTECH SYSTEMS SRL",
      taxId: "1018600013048",
    });
  });

  it("returns empty partner search results from real endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ value: [] })),
    ));

    const provider = newRealPartnerProvider();

    await expect(
      provider.partners.searchPartners({ query: "missing" }),
    ).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it("fails partner search on timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("timeout"), {
        name: "TimeoutError",
      })),
    );

    await expect(
      newRealPartnerProvider().partners.searchPartners({ query: "partner" }),
    ).rejects.toBeInstanceOf(IntegrationTimeoutError);
  });

  it.each([401, 403, 500])(
    "fails partner search safely for HTTP %i",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("{}", { status })),
      );

      const expectedError =
        status === 401
          ? IntegrationUnauthorizedError
          : status === 403
            ? IntegrationForbiddenError
            : IntegrationHttpError;

      await expect(
        newRealPartnerProvider().partners.searchPartners({ query: "partner" }),
      ).rejects.toBeInstanceOf(expectedError);
    },
  );

  it("fails partner search on invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("invalid json");
        },
      }),
    );

    await expect(
      newRealPartnerProvider().partners.searchPartners({ query: "partner" }),
    ).rejects.toBeInstanceOf(IntegrationValidationError);
  });

  it("does not use mock partner data unless explicitly enabled", async () => {
    const provider = new OneCProvider({
      baseUrl: null,
      username: null,
      password: null,
      useMockPartners: false,
    });

    await expect(
      provider.partners.searchPartners({ query: "BG123456789" }),
    ).rejects.toBeInstanceOf(IntegrationProviderUnavailableError);
  });
});

function newRealPartnerProvider(): OneCProvider {
  return new OneCProvider({
    baseUrl: "https://erp-api.novotech.md",
    username: "odata-user",
    password: "odata-password",
    requestTimeoutMs: 10000,
    useMockPartners: false,
  });
}
