import { describe, expect, it } from "vitest";

import {
  deriveNormalizedModelFallback,
  normalizeProductIdentifier,
  quickProductMatchKind,
  rankQuickProductResults,
} from "../quick-product-search";

const products = [
  { id: "partial", sku: "4005401", name: "DH-C4K-P Kit" },
  { id: "model", sku: "900001", name: "PFA130-E" },
  { id: "sku", sku: "400540", name: "DH-C4K-P" },
];

describe("quick product search ranking", () => {
  it("ranks exact SKU before prefix and text matches", () => {
    expect(rankQuickProductResults("400540", products).map((product) => product.id)).toEqual([
      "sku",
      "partial",
      "model",
    ]);
    expect(quickProductMatchKind("400540", products[2])).toBe("exact_sku");
  });

  it("ranks exact and normalized manufacturer models deterministically", () => {
    expect(rankQuickProductResults("PFA130-E", products)[0].id).toBe("model");
    expect(rankQuickProductResults("pfa130e", products)[0].id).toBe("model");
    expect(quickProductMatchKind("pfa130e", products[1])).toBe("normalized_model");
    expect(normalizeProductIdentifier(" PFA 130-E ")).toBe("pfa130e");
  });

  it("preserves source order for ambiguous partial matches", () => {
    const ambiguous = [
      { id: "one", sku: "100001", name: "PFA130-E bracket" },
      { id: "two", sku: "100002", name: "PFA130-W bracket" },
    ];
    expect(rankQuickProductResults("PFA130", ambiguous).map((product) => product.id)).toEqual(["one", "two"]);
  });

  it("derives only a bounded deterministic fallback for compact model codes", () => {
    expect(deriveNormalizedModelFallback("PFA130E")).toBe("pfa130");
    expect(deriveNormalizedModelFallback("400540")).toBeNull();
    expect(deriveNormalizedModelFallback("camera")).toBeNull();
  });
});
