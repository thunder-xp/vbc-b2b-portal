import { describe, expect, it } from "vitest";

import { deriveEstimateDraftReadiness, type EstimateDraftReadinessInput } from "../draft-readiness";

const line = { id: "line-1", position: 1, quantity: 1, sellingUnitPrice: 100 };
const valid: EstimateDraftReadinessInput = {
  applicable: true,
  dirty: false,
  estimateRevision: 3,
  canManage: true,
  lines: [line],
  currencyCode: "USD",
  totalAmount: 100,
  hasIncompletePricing: false,
  calculationError: null,
  latestProposal: null,
};

describe("deriveEstimateDraftReadiness", () => {
  it("guides an empty draft to the existing product picker", () => {
    expect(deriveEstimateDraftReadiness({ ...valid, lines: [], totalAmount: 0 })).toEqual(expect.objectContaining({
      state: "add_product",
      primaryAction: "add_product",
      target: { kind: "product_picker" },
      ready: false,
    }));
  });

  it("targets the first invalid quantity before every later blocker", () => {
    const result = deriveEstimateDraftReadiness({
      ...valid,
      lines: [{ ...line, id: "line-1", position: 1 }, { ...line, id: "line-2", position: 2, quantity: 0, sellingUnitPrice: null }],
    });
    expect(result).toEqual(expect.objectContaining({
      state: "fix_quantity",
      primaryAction: "focus_line",
      target: { kind: "line", lineId: "line-2", field: "quantity" },
      linePosition: 2,
    }));
  });

  it.each([null, Number.NaN, -1])("targets an invalid selling price (%s)", (sellingUnitPrice) => {
    const result = deriveEstimateDraftReadiness({ ...valid, lines: [{ ...line, sellingUnitPrice }] });
    expect(result).toEqual(expect.objectContaining({
      state: "fix_price",
      primaryAction: "focus_line",
      target: { kind: "line", lineId: "line-1", field: "price" },
    }));
  });

  it("targets the governed source of an advanced calculation error", () => {
    const result = deriveEstimateDraftReadiness({
      ...valid,
      totalAmount: null,
      calculationError: { target: { kind: "line", lineId: "line-1", field: "details" } },
    });
    expect(result).toEqual(expect.objectContaining({
      state: "fix_line",
      primaryAction: "focus_line",
      target: { kind: "line", lineId: "line-1", field: "details" },
    }));
  });

  it("requires saving a valid dirty draft before proposal preparation", () => {
    expect(deriveEstimateDraftReadiness({ ...valid, dirty: true })).toEqual(expect.objectContaining({
      state: "save_changes",
      primaryAction: "save",
      ready: true,
    }));
  });

  it("prepares the proposal for a saved valid draft with no current snapshot", () => {
    expect(deriveEstimateDraftReadiness(valid)).toEqual(expect.objectContaining({
      state: "prepare_proposal",
      primaryAction: "prepare_proposal",
      ready: true,
    }));
  });

  it("generates the PDF only after a current prepared proposal exists", () => {
    expect(deriveEstimateDraftReadiness({
      ...valid,
      latestProposal: { estimateRevision: 3, status: "prepared", pdfStatus: null },
    })).toEqual(expect.objectContaining({ state: "prepare_pdf", primaryAction: "generate_pdf" }));
  });

  it("hands off to the existing delivery workflow once the current PDF is ready", () => {
    expect(deriveEstimateDraftReadiness({
      ...valid,
      latestProposal: { estimateRevision: 3, status: "prepared", pdfStatus: "ready" },
    })).toEqual(expect.objectContaining({ state: "handoff", primaryAction: null }));
  });

  it("does not invent customer, email, stock, or order readiness inputs", () => {
    const result = deriveEstimateDraftReadiness(valid);
    expect(Object.keys(valid)).not.toEqual(expect.arrayContaining(["customer", "email", "stock", "order"]));
    expect(result.checks.map((check) => check.code)).toEqual([
      "has_lines",
      "valid_quantities",
      "complete_prices",
      "valid_currency",
      "calculated_total",
    ]);
  });

  it("exposes blocker context but no unauthorized mutation action", () => {
    expect(deriveEstimateDraftReadiness({ ...valid, lines: [], totalAmount: 0, canManage: false })).toEqual(expect.objectContaining({
      state: "add_product",
      primaryAction: null,
      target: { kind: "product_picker" },
    }));
  });

  it("does not guide immutable lifecycle states", () => {
    expect(deriveEstimateDraftReadiness({ ...valid, applicable: false })).toEqual(expect.objectContaining({
      state: "not_applicable",
      primaryAction: null,
    }));
  });
});
