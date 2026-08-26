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

  it("derives physical-person payment methods only from governed contracts", () => {
    const options = toPartnerCheckoutOptions(configuration({
      counterpartyTypeCode: "ФизическоеЛицо",
    }));

    expect(options.paymentMethods[0].enabled).toBe(true);
    expect(options.paymentMethods[1].enabled).toBe(true);
  });

  it("supports a governed cash-only company", () => {
    const options = toPartnerCheckoutOptions(configuration({ cashless: null }));

    expect(options.paymentMethods).toEqual([
      expect.objectContaining({ value: "cashless", enabled: false }),
      expect.objectContaining({ value: "cash", enabled: true, contractLabel: "CASH-1" }),
    ]);
  });

  it("fails closed when neither payment contract is governed", () => {
    const options = toPartnerCheckoutOptions(configuration({ cashless: null, cash: null }));

    expect(options.paymentMethods.every((method) => !method.enabled)).toBe(true);
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

  it("rejects a cashless contract whose price type differs from the company profile", () => {
    const options = toPartnerCheckoutOptions(configuration({
      cashless: contract("contract-cashless", "NS-1", "other-price-type"),
    }));

    expect(options.paymentMethods[0].enabled).toBe(false);
  });

  it("allows a cashless settlement currency to differ from its governed price currency", () => {
    const cashless = {
      ...contract("contract-cashless", "NS-1"),
      settlementCurrencyRef: "settlement-currency",
    };

    expect(toPartnerCheckoutOptions(configuration({ cashless })).paymentMethods[0].enabled).toBe(true);
  });

  it("allows a governed cash contract with its own validated price type and currency", () => {
    const cash = contract("contract-cash", "CASH-1", "cash-price-type");
    const config = configuration({ cash });

    expect(toPartnerCheckoutOptions(config).paymentMethods[1].enabled).toBe(true);
    expect(resolveCheckoutSelection(config, selection("cash")).contract.priceTypeRef).toBe("cash-price-type");
  });

  it("allows settlement currency to differ from the governed price-type currency", () => {
    const cash = { ...contract("contract-cash", "CASH-1"), settlementCurrencyRef: "other-currency" };
    expect(toPartnerCheckoutOptions(configuration({ cash })).paymentMethods[1].enabled).toBe(true);
  });

  it.each([
    {
      name: "missing settlement currency",
      override: { settlementCurrencyRef: null },
    },
    {
      name: "missing authoritative price currency",
      override: { authoritativePriceCurrencyRef: null },
    },
    {
      name: "missing published price currency",
      override: { publishedPriceCurrencyRef: null },
    },
    {
      name: "authoritative and published price currency mismatch",
      override: { publishedPriceCurrencyRef: "different-price-currency" },
    },
  ])("fails closed for $name", ({ override }) => {
    const cashless = { ...contract("contract-cashless", "NS-1"), ...override };
    expect(toPartnerCheckoutOptions(configuration({ cashless })).paymentMethods[0].enabled).toBe(false);
  });

  it("rejects an absent payment date instead of deriving one", () => {
    expect(() => resolveCheckoutSelection(configuration(), {
      ...selection("cashless"),
      paymentDate: "",
    })).toThrow(expect.objectContaining({ code: "ORDER_INVALID_PAYMENT_DATE" }));
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
    settlementCurrencyRef: "settlement-currency-ref",
    settlementCurrencyCode: "MDL",
    authoritativePriceCurrencyRef: "price-currency-ref",
    authoritativePriceCurrencyCode: "USD",
    publishedPriceCurrencyRef: "price-currency-ref",
    publishedPriceCurrencyCode: "USD",
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
    publishedPriceCurrencyRef: "price-currency-ref",
    publishedPriceCurrencyCode: "USD",
    cashDiagnosticCode: "CASH_CONTRACT_QUALIFIED",
    cashless: contract("contract-cashless", "NS-1"),
    cash: contract("contract-cash", "CASH-1"),
    carriers: [{ id: "carrier-local-id", name: "Carrier", externalRef: "carrier-1c-ref" }],
    ...overrides,
  };
}
