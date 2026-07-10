import { describe, expect, it } from "vitest";

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
      reference: { ref: "PARTNER-1", type: "partner-company" },
      displayName: "Security Partner",
      legalName: "Security Partner Ltd.",
      taxId: "BG123456789",
      status: "active",
      managerReference: null,
      contracts: [
        {
          reference: { ref: "CONTRACT-1", type: "partner-contract" },
          name: "Default contract",
          active: true,
          default: true,
        },
      ],
      priceTypes: [
        {
          reference: { ref: "PRICE-1", type: "price-type" },
          name: "Wholesale",
          currency: "BGN",
          active: true,
          default: true,
        },
      ],
      metadata: { sourceUpdatedAt: "2026-07-09T00:00:00.000Z" },
    };

    const dto = mapper.toSearchResultDTO(payload);

    expect(dto.reference.externalId).toBe("PARTNER-1");
    expect(dto.contracts[0]?.reference.externalId).toBe("CONTRACT-1");
    expect(dto.priceTypes[0]?.reference.externalId).toBe("PRICE-1");
  });

  it("uses mock partner search without HTTP configuration", async () => {
    const provider = new OneCProvider({ useMockPartners: true });

    const result = await provider.partners.searchPartners({
      query: "BG123456789",
    });

    expect(result.items[0]).toMatchObject({
      displayName: "Novotech Demo Partner",
      taxId: "BG123456789",
    });
    expect(result.items[0]?.contracts[0]?.reference.externalId).toBe(
      "MOCK-CONTRACT-001",
    );
    expect(result.items[0]?.priceTypes[0]?.reference.externalId).toBe(
      "MOCK-PRICE-TYPE-001",
    );
  });
});
