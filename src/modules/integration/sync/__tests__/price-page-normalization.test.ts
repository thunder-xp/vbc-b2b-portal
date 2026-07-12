import { describe, expect, it } from "vitest";
import type { PriceRegisterStageRow } from "../../providers/one-c";
import { normalizePricePage } from "../price-page-normalization";

describe("normalizePricePage", () => {
  it("deduplicates the production-shaped page-three fixture", () => {
    const result = normalizePricePage(productionPageThreeFixture);
    expect(result.diagnostics).toEqual({ received: 5, uniqueKeys: 3, duplicateKeys: 2, rowsDeduplicated: 2 });
    expect(result.rows).toHaveLength(3);
  });

  it("keeps the greatest effective date", () => { const result = normalizePricePage([row({ effectiveAt: "2026-01-01T00:00:00Z", amount: 100 }), row({ effectiveAt: "2026-02-01T00:00:00Z", amount: 120 })]); expect(result.rows[0].amount).toBe(120); });
  it("allows a later inactive row to suppress an earlier active row", () => { const result = normalizePricePage([row({ isCurrent: true }), row({ isCurrent: false })]); expect(result.rows[0].isCurrent).toBe(false); });
  it("collapses identical duplicates", () => { const value = row(); expect(normalizePricePage([value, { ...value }]).rows).toEqual([value]); });
  it("is deterministic for the same stable source order", () => { expect(normalizePricePage(productionPageThreeFixture)).toEqual(normalizePricePage([...productionPageThreeFixture])); });
});

const productionPageThreeFixture = [
  row({ externalProductRef: "product-a", amount: 100 }),
  row({ externalProductRef: "product-a", amount: 110, effectiveAt: "2026-02-01T00:00:00Z" }),
  row({ externalProductRef: "product-b", isCurrent: true }),
  row({ externalProductRef: "product-b", isCurrent: false }),
  row({ externalProductRef: "product-c" }),
];
function row(overrides: Partial<PriceRegisterStageRow> = {}): PriceRegisterStageRow { return { externalProductRef: "product", externalPriceTypeRef: "type", externalCharacteristicRef: "00000000-0000-0000-0000-000000000000", amount: 100, isCurrent: true, effectiveAt: "2026-01-01T00:00:00Z", ...overrides }; }
