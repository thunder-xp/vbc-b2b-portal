import { describe, expect, it } from "vitest";
import { assertPurchasingListGeometry } from "../../../../../scripts/purchasing-list-geometry-contract.mjs";

const row = { image: { width: 52, height: 52 }, quantity: { x: 800, y: 200 }, price: { x: 924, y: 200 }, stock: { x: 1072, y: 200 }, actions: { x: 1204, y: 200 } };
const sample = () => ({ width: 1440, scrollWidth: 1440, controls: [{ width: 44, height: 44 }], rows: [row, { ...row, quantity: { ...row.quantity, y: 288 }, price: { ...row.price, y: 288 }, stock: { ...row.stock, y: 288 } }], noteCount: 0, saveCount: 0 });

describe("live purchasing list geometry contract", () => {
  it("accepts aligned desktop rows and compact mobile cards", () => {
    expect(assertPurchasingListGeometry(sample()).passed).toBe(true);
    expect(assertPurchasingListGeometry({ ...sample(), width: 390, scrollWidth: 390 }).passed).toBe(true);
  });
  it("rejects horizontal overflow and undersized mobile controls", () => {
    expect(() => assertPurchasingListGeometry({ ...sample(), width: 390, scrollWidth: 450 })).toThrow(/overflow/);
    expect(() => assertPurchasingListGeometry({ ...sample(), controls: [{ width: 16, height: 16 }] })).toThrow(/44px/);
  });
  it("rejects shifted desktop columns and duplicate save controls", () => {
    expect(() => assertPurchasingListGeometry({ ...sample(), rows: [row, { ...row, quantity: { x: 850, y: 200 } }] })).toThrow(/alignment/);
    expect(() => assertPurchasingListGeometry({ ...sample(), saveCount: 2 })).toThrow(/At most one/);
    expect(() => assertPurchasingListGeometry({ ...sample(), noteCount: 1 })).toThrow(/Note/);
  });
});
