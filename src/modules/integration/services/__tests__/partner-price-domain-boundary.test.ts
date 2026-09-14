import { describe, expect, it, vi } from "vitest";

import type { PartnerProvider } from "../../contracts";
import type { PartnerContractDTO, PartnerPriceTypeDTO } from "../../dto";
import { DefaultPartnerLookupService } from "../partner-lookup.service";

const GOLD = "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c";
const BCR_A = "1668b73c-aea5-11f1-1b94-bc2411369b92";
const INTERNAL_ACCOUNTING = "7481362e-b5b8-11e4-8355-74d02b7dfd8c";

describe("partner price-domain boundary", () => {
  it("does not expose A/B/C BCR in the partner price-type selector", async () => {
    const provider = providerFixture([priceType(GOLD), priceType(BCR_A)]);
    const result = await new DefaultPartnerLookupService(provider).listPriceTypes();
    expect(result.items.map((item) => item.reference.externalId)).toEqual([GOLD]);
  });

  it("does not return a partner contract backed by a final-customer retail price type", async () => {
    const provider = providerFixture([]);
    vi.mocked(provider.fetchPartnerContracts).mockResolvedValue({
      items: [contract("partner-contract", GOLD), contract("retail-contract", BCR_A)],
      nextCursor: null,
    });
    const result = await new DefaultPartnerLookupService(provider).getPartnerContracts("partner");
    expect(result.items.map((item) => item.reference.externalId)).toEqual(["partner-contract"]);
  });

  it("fails closed when final-customer retail Ref_Key is requested directly", async () => {
    const provider = providerFixture([priceType(BCR_A)]);
    await expect(new DefaultPartnerLookupService(provider).getPriceType(BCR_A)).resolves.toBeNull();
    expect(provider.fetchPriceType).not.toHaveBeenCalled();
  });

  it("fails closed for unapproved internal price types", async () => {
    const provider = providerFixture([priceType(INTERNAL_ACCOUNTING)]);
    await expect(
      new DefaultPartnerLookupService(provider).getPriceType(INTERNAL_ACCOUNTING),
    ).resolves.toBeNull();
    expect(provider.fetchPriceType).not.toHaveBeenCalled();
  });
});

function providerFixture(priceTypes: PartnerPriceTypeDTO[]): PartnerProvider {
  return {
    fetchPartnerCompanies: vi.fn(),
    searchPartners: vi.fn(),
    fetchPartnerContracts: vi.fn(),
    fetchCommercialProfile: vi.fn(),
    resolveCustomerOrderContract: vi.fn(),
    fetchPriceType: vi.fn(async ({ reference }) => priceTypes.find((item) => item.reference.externalId === reference) ?? null),
    listPriceTypes: vi.fn(async () => ({ items: priceTypes, nextCursor: null })),
  };
}

function priceType(reference: string): PartnerPriceTypeDTO {
  return {
    reference: { providerCode: "one-c", externalId: reference, externalType: "Catalog_ВидыЦен" },
    name: reference === GOLD ? "GOLD" : "A, BCR",
    currency: "MDL",
    includesVat: true,
    type: null,
    isDefault: false,
    active: true,
  };
}

function contract(reference: string, priceTypeReference: string): PartnerContractDTO {
  return {
    reference: { providerCode: "one-c", externalId: reference, externalType: "Catalog_ДоговорыКонтрагентов" },
    code: reference,
    name: reference,
    number: null,
    date: null,
    contractType: null,
    organizationReference: null,
    isDefault: true,
    active: true,
    priceTypeReference: { providerCode: "one-c", externalId: priceTypeReference, externalType: "Catalog_ВидыЦен" },
    priceTypeName: null,
    priceTypeSource: "contract",
  };
}
