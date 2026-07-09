import { describe, expect, it } from "vitest";

import { IntegrationProviderNotImplementedError } from "../one-c-provider";
import { DefaultOneCCatalogMapper, OneCProvider } from "../index";
import type { OneCCatalogProductPayload } from "../one-c-provider.types";

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
});
