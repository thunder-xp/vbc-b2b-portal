import { describe, expect, it } from "vitest";

import { NOVOTECH_ONE_C_ORGANIZATION_REF } from "../../../integration/config";
import type { CheckoutConfiguration } from "../../repositories";
import {
  resolveCheckoutSelection,
  toPartnerCheckoutOptions,
} from "../checkout-configuration.service";

const PRICE_TYPE_REF = "11111111-1111-4111-8111-111111111111";

describe("checkout configuration", () => {
  it("offers both governed methods to a legal entity with both contracts", () => {
    const options = toPartnerCheckoutOptions(configuration());

    expect(options.counterpartyKind).toBe("legal_entity");
    expect(options.paymentMethods).toEqual([
      expect.objectContaining({ value: "cashless", enabled: true, contractLabel: "NS-1" }),
      expect.objectContaining({ value: "cash", enabled: true, contractLabel: "CASH-1" }),
    ]);
  });

  it("disables cash when no governed cash-contract mapping exists", () => {
    const options = toPartnerCheckoutOptions(configuration({ cash: null }));

    expect(options.paymentMethods[1]).toMatchObject({
      value: "cash",
      enabled: false,
      unavailableReason: "contract_unavailable",
    });
  });

  it("allows only a governed cash contract for a physical person", () => {
    const options = toPartnerCheckoutOptions(configuration({
      counterpartyTypeCode: "ФизическоеЛицо",
    }));

    expect(options.paymentMethods[0]).toMatchObject({
      enabled: false,
      unavailableReason: "physical_person_cash_only",
    });
    expect(options.paymentMethods[1].enabled).toBe(true);
  });

  it("resolves the exact cashless and cash contracts without browser references", () => {
    const config = configuration();

    expect(resolveCheckoutSelection(config, selection("cashless"))).toMatchObject({
      contract: { contractRef: "contract-cashless" },
      carrierExternalRef: null,
    });
    expect(resolveCheckoutSelection(config, selection("cash"))).toMatchObject({
      contract: { contractRef: "contract-cash" },
      carrierExternalRef: null,
    });
  });

  it("requires a governed carrier for delivery and omits it for pickup", () => {
    const config = configuration();

    try {
      resolveCheckoutSelection(config, {
        ...selection("cashless"),
        fulfillmentMethod: "delivery",
        carrierId: "browser-supplied-1c-reference",
      });
      expect.fail("Expected the ungoverned carrier to be rejected.");
    } catch (error) {
      expect(error).toMatchObject({ code: "ORDER_CARRIER_REQUIRED" });
    }
    expect(resolveCheckoutSelection(config, {
      ...selection("cashless"),
      fulfillmentMethod: "delivery",
      carrierId: "carrier-local-id",
    }).carrierExternalRef).toBe("carrier-1c-ref");
    expect(resolveCheckoutSelection(config, selection("cashless")).carrierExternalRef).toBeNull();
  });

  it("rejects a contract whose price type differs from the company profile", () => {
    const options = toPartnerCheckoutOptions(configuration({
      cashless: contract("contract-cashless", "NS-1", "other-price-type"),
    }));

    expect(options.paymentMethods[0].enabled).toBe(false);
  });
});

function selection(paymentMethod: "cashless" | "cash") {
  return {
    paymentMethod,
    paymentDate: "2026-08-22",
    fulfillmentMethod: "pickup" as const,
    carrierId: null,
  };
}

function contract(contractRef: string, number: string, priceTypeRef = PRICE_TYPE_REF) {
  return {
    contractRef,
    name: number,
    number,
    active: true,
    contractType: "С покупателем",
    organizationRef: NOVOTECH_ONE_C_ORGANIZATION_REF,
    priceTypeRef,
  };
}

function configuration(overrides: Partial<CheckoutConfiguration> = {}): CheckoutConfiguration {
  return {
    companyId: "company-1",
    counterpartyTypeCode: "ЮридическоеЛицо",
    governmentBodyTypeCode: null,
    counterpartyActive: true,
    counterpartyRef: "counterparty-ref",
    priceTypeRef: PRICE_TYPE_REF,
    currencyRef: "currency-ref",
    currencyCode: "USD",
    cashless: contract("contract-cashless", "NS-1"),
    cash: contract("contract-cash", "CASH-1"),
    carriers: [{ id: "carrier-local-id", name: "Carrier", externalRef: "carrier-1c-ref" }],
    ...overrides,
  };
}
