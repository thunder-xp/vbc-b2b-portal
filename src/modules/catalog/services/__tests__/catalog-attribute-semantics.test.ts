import { describe, expect, it } from "vitest";

import {
  PRODUCT_CREATION_DATE_ATTRIBUTE_KEY,
  PRODUCT_CREATION_DATE_PROPERTY_REF,
  classifyCatalogAttribute,
  isCustomerFacingCatalogAttribute,
  isCustomerFacingCatalogAttributeKey,
} from "../../attribute-semantics";

describe("catalog attribute semantics", () => {
  it("classifies the stable 1C creation-date identity as merchandising internal", () => {
    expect(classifyCatalogAttribute(PRODUCT_CREATION_DATE_PROPERTY_REF.toUpperCase(), true))
      .toBe("MERCHANDISING_INTERNAL");
    expect(isCustomerFacingCatalogAttribute("MERCHANDISING_INTERNAL")).toBe(false);
    expect(isCustomerFacingCatalogAttributeKey(PRODUCT_CREATION_DATE_ATTRIBUTE_KEY)).toBe(false);
  });

  it("preserves customer-facing defaults for unknown 1C properties", () => {
    expect(classifyCatalogAttribute("11111111-1111-4111-8111-111111111111", true))
      .toBe("FACETABLE_SPECIFICATION");
    expect(classifyCatalogAttribute("22222222-2222-4222-8222-222222222222", false))
      .toBe("CUSTOMER_SPECIFICATION");
    expect(isCustomerFacingCatalogAttribute("CUSTOMER_SPECIFICATION")).toBe(true);
  });
});
