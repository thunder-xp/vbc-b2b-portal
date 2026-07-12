import { describe, expect, it } from "vitest";
import { normalizeOneCCurrencyCode } from "../one-c-currency";

describe("normalizeOneCCurrencyCode", () => {
  it("maps the 1C currency code 999 to USD", () => { expect(normalizeOneCCurrencyCode("999")).toBe("USD"); });
  it("maps the 1C currency code 498 to MDL", () => { expect(normalizeOneCCurrencyCode("498")).toBe("MDL"); });
  it("preserves normalized ISO codes", () => { expect(normalizeOneCCurrencyCode(" mdl ")).toBe("MDL"); });
  it("does not expose unresolved internal currency codes", () => { expect(normalizeOneCCurrencyCode("XXX")).toBeNull(); expect(normalizeOneCCurrencyCode("123")).toBeNull(); });
});
