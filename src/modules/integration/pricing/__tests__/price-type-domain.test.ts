import { describe, expect, it } from "vitest";

import {
  classifyOneCPriceTypeRef,
  isFinalCustomerRetailPriceType,
  isGovernedPartnerContractPriceType,
} from "../price-type-domain";

describe("1C price type domain classification", () => {
  it.each([
    "1668b73c-aea5-11f1-1b94-bc2411369b92",
    "eb632a56-aeb6-11f1-1b94-bc2411369b92",
    "fc52173c-aeb6-11f1-1b94-bc2411369b92",
  ])("classifies BCR retail Ref_Key %s outside partner pricing", (reference) => {
    expect(classifyOneCPriceTypeRef(reference)).toBe("FINAL_CUSTOMER_RETAIL_PRICE");
    expect(isFinalCustomerRetailPriceType(reference.toUpperCase())).toBe(true);
    expect(isGovernedPartnerContractPriceType(reference)).toBe(false);
  });

  it.each([
    "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c",
    "9adc073c-3eb5-11f0-8d8a-7239d3b7bd5c",
    "e71d8dd2-3eb0-11f0-8d8a-7239d3b7bd5c",
    "3dcb5436-a5c0-11f0-0481-7239d3b7bd5c",
  ])("classifies governed partner Ref_Key %s as contract pricing", (reference) => {
    expect(classifyOneCPriceTypeRef(reference)).toBe("PARTNER_CONTRACT_PRICE");
  });

  it("fails unregistered price types into the internal/other domain", () => {
    expect(classifyOneCPriceTypeRef("7481362e-b5b8-11e4-8355-74d02b7dfd8c")).toBe("INTERNAL/OTHER");
  });
});
