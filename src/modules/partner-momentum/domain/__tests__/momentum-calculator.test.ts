import { describe, expect, it } from "vitest";

import { calculatePartnerMomentum } from "../momentum-calculator";
import type { MomentumCalculationInput, MomentumOrderFact } from "../../types";

const NOW = "2026-08-02T12:00:00.000Z";

describe("calculatePartnerMomentum", () => {
  it("keeps insufficient history outside risk classification", () => {
    const result = calculatePartnerMomentum(input([order("2026-07-01", 100, "USD", ["a"])]));
    expect(result.status).toBe("insufficient_history");
    expect(result.score).toBeNull();
  });

  it("requires activity spanning at least 60 days and two purchase dates", () => {
    const result = calculatePartnerMomentum(input([
      order("2026-05-01", 100, "USD", ["a"]),
      order("2026-06-01", 100, "USD", ["a"]),
      order("2026-07-01", 100, "USD", ["a"]),
    ]));
    expect(result.eligibility).toBe("eligible");
    expect(result.normalOrderIntervalDays).toBe(30.5);
  });

  it("does not combine monetary totals from different currencies", () => {
    const result = calculatePartnerMomentum(input([
      order("2026-03-01", 100, "USD", ["a"]), order("2026-04-01", 200, "MDL", ["a"]),
      order("2026-05-01", 90, "USD", ["a"]), order("2026-07-01", 180, "MDL", ["a"]),
    ]));
    expect(result.multiCurrency).toBe(true);
    expect(result.primaryCurrency).toBeNull();
    expect(result.monetaryCurrent).toEqual({ MDL: 180 });
    expect(result.monetaryBaseline).toEqual({ USD: 90 });
  });

  it("detects frequency, volume, cycle, and assortment decline deterministically", () => {
    const orders = [
      order("2026-02-01", 90, "USD", ["a"]), order("2026-03-01", 90, "USD", ["a"]),
      order("2026-04-10", 100, "USD", ["a", "b", "c"]), order("2026-05-05", 100, "USD", ["a", "b"]),
      order("2026-06-15", 20, "USD", ["a"]),
    ];
    const first = calculatePartnerMomentum(input(orders));
    const second = calculatePartnerMomentum(input(orders));
    expect(second.score).toBe(first.score);
    expect(second.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining([
      "order_frequency_down", "purchase_cycle_overdue", "assortment_breadth_down", "order_volume_down",
    ]));
  });

  it("bounds interval outliers before calculating the personal cycle", () => {
    const result = calculatePartnerMomentum(input([
      order("2025-12-01"), order("2026-01-01"), order("2026-02-01"), order("2026-03-01"), order("2026-06-30"), order("2026-07-30"),
    ]));
    expect(result.normalOrderIntervalDays).toBeLessThan(60);
    expect(result.averageOrderIntervalDays).toBeLessThan(60);
  });

  it("marks active intent as a reason without replacing purchasing evidence", () => {
    const result = calculatePartnerMomentum({ ...input([order("2026-01-01"), order("2026-03-01"), order("2026-05-01")]), intent: { activeCart: true, templateCount: 1, purchasingListCount: 0, opportunityCount: 1, campaignCount: 1 } });
    expect(result.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining(["active_cart_not_converted", "template_not_used", "price_opportunity_available", "campaign_available"]));
  });

  it("uses exact governed score bands", () => {
    const stable = calculatePartnerMomentum(input([order("2026-02-01"), order("2026-04-01"), order("2026-06-05"), order("2026-07-20")]));
    expect(stable.score).toBeGreaterThanOrEqual(0);
    expect(["growth", "stable", "slowing", "attention_required", "high_risk"]).toContain(stable.rawStatus);
  });

  it("requires confirmation before an ordinary status transition", () => {
    const orders = [order("2026-01-01"), order("2026-03-01"), order("2026-05-01")];
    const first = calculatePartnerMomentum({ ...input(orders), previous: { status: "stable", calculatedAt: "2026-08-01T00:00:00.000Z", pendingStatus: null, pendingCount: 0 } });
    expect(first.status).toBe("stable");
    expect(first.pendingStatus).toBe(first.rawStatus);
    const second = calculatePartnerMomentum({ ...input(orders), previous: { status: first.status, calculatedAt: first.calculatedAt, pendingStatus: first.pendingStatus, pendingCount: first.pendingCount } });
    expect(second.status).toBe(second.rawStatus);
  });

  it("detects recovery after a qualifying new order", () => {
    const result = calculatePartnerMomentum({
      ...input([order("2026-02-01"), order("2026-04-01"), order("2026-06-20"), { ...order("2026-08-02"), id: "00000000-0000-4000-8000-000000000099" }]),
      previous: { status: "attention_required", calculatedAt: "2026-08-01T00:00:00.000Z", pendingStatus: null, pendingCount: 0 },
    });
    expect(result.status).toBe("recovered");
    expect(result.recoveredOrderId).toBe("00000000-0000-4000-8000-000000000099");
    expect(result.reasons).toEqual([{ code: "recovered_after_order", value: null }]);
  });

  it("returns the same result for the same source facts", () => {
    const facts = input([order("2026-01-01"), order("2026-04-01"), order("2026-07-01")]);
    expect(calculatePartnerMomentum(facts)).toEqual(calculatePartnerMomentum(facts));
  });
});

function input(orders: MomentumOrderFact[]): MomentumCalculationInput {
  return { companyId: "00000000-0000-4000-8000-000000000001", companyActive: true, sourceFingerprint: "fixture", now: NOW, orders, intent: { activeCart: false, templateCount: 0, purchasingListCount: 0, opportunityCount: 0, campaignCount: 0 }, previous: null };
}
let ordinal = 1;
function order(date: string, total = 100, currency: string | null = "USD", productIds = ["a"], units = 1): MomentumOrderFact {
  return { id: `00000000-0000-4000-8000-${String(ordinal++).padStart(12, "0")}`, orderedAt: `${date}T10:00:00.000Z`, total, currency, units, productIds };
}
