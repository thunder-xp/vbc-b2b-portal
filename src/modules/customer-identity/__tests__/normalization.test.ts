import { describe, expect, it } from "vitest";

import {
  CustomerIdentityNormalizationError,
  normalizeCustomerEmail,
  normalizeCustomerLegalIdentifier,
  normalizeCustomerPhone,
} from "../normalization";

describe("customer identity normalization", () => {
  it("normalizes only deterministic formatting", () => {
    expect(normalizeCustomerPhone(" +373 (69) 123-456 ")).toBe("+37369123456");
    expect(normalizeCustomerEmail(" Customer@Example.MD ")).toBe("customer@example.md");
    expect(normalizeCustomerLegalIdentifier(" md-10 02/03 ")).toBe("MD100203");
  });

  it("does not guess a phone country code", () => {
    expect(() => normalizeCustomerPhone("069123456")).toThrow(CustomerIdentityNormalizationError);
  });
});
