import { describe, expect, it } from "vitest";
import { assertPartnerWorkingGeometry } from "../../../../scripts/partner-working-geometry-contract.mjs";

const sample = () => ({ width: 1440, scrollWidth: 1440, controls: [{ width: 44, height: 44 }], emptyStates: [{ height: 56 }], attentionCards: [{ height: 120 }], paymentRows: [[{ x: 800 }, { x: 920 }, { x: 1040 }], [{ x: 800 }, { x: 920 }, { x: 1040 }]], redundantHeaderBands: 0, searchSubtitle: false });
describe("partner working geometry", () => {
  it("accepts compact desktop and mobile rectangles", () => {
    expect(assertPartnerWorkingGeometry(sample()).passed).toBe(true);
    expect(assertPartnerWorkingGeometry({ ...sample(), width: 390, scrollWidth: 390, attentionCards: [{ height: 220 }] }).passed).toBe(true);
  });
  it("rejects shifted finance columns and small actions", () => {
    expect(() => assertPartnerWorkingGeometry({ ...sample(), paymentRows: [[{ x: 800 }], [{ x: 830 }]] })).toThrow(/Aligned/);
    expect(() => assertPartnerWorkingGeometry({ ...sample(), controls: [{ width: 36, height: 44 }] })).toThrow(/44px/);
  });
  it("rejects empty bands, horizontal overflow and redundant search copy", () => {
    expect(() => assertPartnerWorkingGeometry({ ...sample(), emptyStates: [{ height: 146 }] })).toThrow(/empty state/);
    expect(() => assertPartnerWorkingGeometry({ ...sample(), scrollWidth: 1500 })).toThrow(/overflow/);
    expect(() => assertPartnerWorkingGeometry({ ...sample(), searchSubtitle: true })).toThrow(/subtitle/);
  });
});
