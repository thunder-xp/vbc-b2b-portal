import { describe, expect, it } from "vitest";

import type { WorkspaceDashboardProjection } from "../../repositories/workspace-dashboard.repository";
import { buildSalesTrendComparison } from "../workspace-home.service";

type Comparison = WorkspaceDashboardProjection["salesAnalytics"]["series"][number]["comparisons"][number];

describe("buildSalesTrendComparison", () => {
  it.each([
    [125, 100, 25, "INCREASE"],
    [295_344, 314_622, -6.1, "DECREASE"],
    [100, 100, 0, "UNCHANGED"],
    [0, 100, -100, "DECREASE"],
  ] as const)("classifies current %s and previous %s", (currentAmount, previousAmount, expectedPercent, state) => {
    expect(buildSalesTrendComparison(comparison({ currentAmount, previousAmount }))).toMatchObject({
      changePercent: expectedPercent,
      state,
    });
  });

  it("uses truthful zero-baseline states without an infinite percentage", () => {
    expect(buildSalesTrendComparison(comparison({ currentAmount: 100, previousAmount: 0 }))).toMatchObject({
      changePercent: null,
      state: "NEW_ACTIVITY",
    });
    expect(buildSalesTrendComparison(comparison({ currentAmount: 0, previousAmount: 0 }))).toMatchObject({
      changePercent: null,
      state: "NO_ACTIVITY",
    });
  });

  it("uses exact amounts for the state even when the one-decimal percentage rounds to zero", () => {
    expect(buildSalesTrendComparison(comparison({ currentAmount: 100.01, previousAmount: 100 }))).toMatchObject({
      changePercent: 0,
      state: "INCREASE",
    });
    expect(buildSalesTrendComparison(comparison({ currentAmount: 99.99, previousAmount: 100 }))).toMatchObject({
      changePercent: -0,
      state: "DECREASE",
    });
  });

  it("derives the current average without mixing comparison periods or currencies", () => {
    expect(buildSalesTrendComparison(comparison({
      currentAmount: 100,
      currentOrderCount: 4,
      previousAmount: 50,
      previousOrderCount: 20,
    }))).toMatchObject({ currentAverageOrder: 25, changePercent: 100 });
  });
});

function comparison(overrides: Partial<Comparison>): Comparison {
  return {
    days: 30,
    currentStart: "2026-08-10",
    currentEnd: "2026-09-08",
    previousStart: "2025-08-10",
    previousEnd: "2025-09-08",
    currentAmount: 0,
    previousAmount: 0,
    currentOrderCount: 0,
    previousOrderCount: 0,
    ...overrides,
  };
}
