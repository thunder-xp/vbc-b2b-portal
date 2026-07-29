import { beforeEach, describe, expect, it } from "vitest";

import {
  comparisonStorageKey,
  readComparisonIds,
  writeComparisonIds,
} from "../comparison-storage";

beforeEach(() => localStorage.clear());

describe("comparison storage scope", () => {
  it("migrates category-scoped selections into one user-company comparison", () => {
    localStorage.setItem(
      "novotech-catalog-compare:company-1:user-1:category-1",
      JSON.stringify(["product-1", "product-2"]),
    );
    localStorage.setItem(
      "novotech-catalog-compare:company-1:user-1:category-2",
      JSON.stringify(["product-2", "product-3"]),
    );

    expect(readComparisonIds("company-1", "user-1")).toEqual([
      "product-1",
      "product-2",
      "product-3",
    ]);
    expect(JSON.parse(
      localStorage.getItem(comparisonStorageKey("company-1", "user-1")) ?? "[]",
    )).toEqual(["product-1", "product-2", "product-3"]);
  });

  it("isolates selections by both company and user", () => {
    writeComparisonIds("company-1", "user-1", ["product-1"]);
    writeComparisonIds("company-2", "user-1", ["product-2"]);
    writeComparisonIds("company-1", "user-2", ["product-3"]);

    expect(readComparisonIds("company-1", "user-1")).toEqual(["product-1"]);
    expect(readComparisonIds("company-2", "user-1")).toEqual(["product-2"]);
    expect(readComparisonIds("company-1", "user-2")).toEqual(["product-3"]);
  });

  it("deduplicates and bounds active product IDs", () => {
    expect(writeComparisonIds("company-1", "user-1", [
      "one",
      "one",
      "two",
      "three",
      "four",
      "five",
    ])).toEqual(["one", "two", "three", "four"]);
  });
});
