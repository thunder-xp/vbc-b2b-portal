import { describe, expect, it } from "vitest";

import type { SducDecreasePolicy } from "../../types";
import { evaluateDecreaseEnvelope } from "../decrease-envelope";

const policy: SducDecreasePolicy = {
  id: "policy-1",
  mechanismType: "REORDER_DUE",
  direction: "DECREASE",
  enabled: true,
  executionMode: "DRY_RUN",
  globalCeilingPercent: "2",
  mechanismMaximumPercent: "3",
  discountStepsPercent: ["0.1", "0.25", "0.5", "0.8", "1", "1.5", "2"],
  stackable: false,
  validitySeconds: 3600,
  priority: 80,
};

describe("evaluateDecreaseEnvelope", () => {
  it("uses the largest fractional policy step within request and every ceiling", () => {
    const result = evaluateDecreaseEnvelope({
      basePrice: "100",
      stopPrice: "90",
      baseCurrency: "usd",
      stopCurrency: "USD",
      requestedDiscountPercent: "0.83",
      policy,
    });

    expect(result).toMatchObject({
      eligible: true,
      reasonCode: "ELIGIBLE",
      reserveAbsolute: "10",
      reservePercent: "10",
      allowedDiscountPercent: "2",
      approvedDiscountPercent: "0.8",
      effectivePrice: "99.200000",
      currency: "USD",
      executionMode: "DRY_RUN",
    });
  });

  it("floors the available step at the STOP-derived reserve", () => {
    const result = evaluateDecreaseEnvelope({
      basePrice: "100",
      stopPrice: "99.74",
      baseCurrency: "USD",
      stopCurrency: "USD",
      requestedDiscountPercent: "2",
      policy,
    });

    expect(result.approvedDiscountPercent).toBe("0.25");
    expect(result.effectivePrice).toBe("99.750000");
    expect(result.effectivePrice).not.toBe("99.74");
  });

  it.each([
    ["94", "6", true],
    ["99.5", "0.5", true],
    ["100", null, false],
    ["105", null, false],
  ] as const)("handles the governed BASE=100 STOP=%s matrix", (stopPrice, reserve, eligible) => {
    const result = evaluateDecreaseEnvelope({
      basePrice: "100",
      stopPrice,
      baseCurrency: "USD",
      stopCurrency: "USD",
      requestedDiscountPercent: "1",
      policy,
    });
    expect(result.eligible).toBe(eligible);
    expect(result.reservePercent).toBe(reserve);
  });

  it("approves 0.5% when a 1% request has only 0.68% economic reserve", () => {
    const result = evaluateDecreaseEnvelope({
      basePrice: "100",
      stopPrice: "99.32",
      baseCurrency: "USD",
      stopCurrency: "USD",
      requestedDiscountPercent: "1",
      policy,
    });
    expect(result.approvedDiscountPercent).toBe("0.5");
    expect(result.constraintsApplied).toContain("REQUEST_ABOVE_ALLOWED");
  });

  it.each([
    [{ basePrice: null }, "NO_BASE_PRICE"],
    [{ basePrice: "0" }, "INVALID_BASE_PRICE"],
    [{ stopPrice: null }, "NO_STOP_PRICE"],
    [{ stopPrice: "0" }, "INVALID_STOP_PRICE"],
    [{ stopCurrency: "MDL" }, "CURRENCY_NOT_COMPARABLE"],
    [{ stopPrice: "100" }, "NO_DOWNWARD_PRICE_RESERVE"],
    [{ requestedDiscountPercent: "0" }, "INVALID_REQUESTED_DISCOUNT"],
  ] as const)("returns a deterministic rejection for %o", (override, reasonCode) => {
    expect(
      evaluateDecreaseEnvelope({
        basePrice: "100",
        stopPrice: "90",
        baseCurrency: "USD",
        stopCurrency: "USD",
        requestedDiscountPercent: "1",
        policy,
        ...override,
      }),
    ).toMatchObject({ eligible: false, reasonCode });
  });

  it("does not authorize without explicit production-approved configuration", () => {
    expect(
      evaluateDecreaseEnvelope({
        basePrice: "100",
        stopPrice: "90",
        baseCurrency: "USD",
        stopCurrency: "USD",
        requestedDiscountPercent: "1",
        policy: { ...policy, globalCeilingPercent: null },
      }).reasonCode,
    ).toBe("SYSTEM_NOT_ACTIVE");
    expect(
      evaluateDecreaseEnvelope({
        basePrice: "100",
        stopPrice: "90",
        baseCurrency: "USD",
        stopCurrency: "USD",
        requestedDiscountPercent: "1",
        policy: { ...policy, enabled: false },
      }).reasonCode,
    ).toBe("MECHANISM_DISABLED");
  });

  it("never implements the future increase direction through the decrease engine", () => {
    const result = evaluateDecreaseEnvelope({
      basePrice: "100",
      stopPrice: "90",
      baseCurrency: "USD",
      stopCurrency: "USD",
      requestedDiscountPercent: "1",
      policy: { ...policy, direction: "INCREASE" },
    });
    expect(result.reasonCode).toBe("DIRECTION_NOT_IMPLEMENTED");
  });
});
