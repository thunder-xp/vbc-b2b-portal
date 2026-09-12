import { describe, expect, it } from "vitest";

import type { SducPriceAuthorization } from "../../types";
import {
  revalidateDecreaseAuthorization,
  selectDecreaseAuthorization,
} from "../authorization-policy";

const authorization: SducPriceAuthorization = {
  id: "b",
  companyId: "company-1",
  productId: "product-1",
  direction: "DECREASE",
  mechanismType: "REORDER_DUE",
  mechanismInstanceId: "event-1",
  basePrice: "100",
  stopPrice: "90",
  currency: "USD",
  requestedDiscountPercent: "2",
  approvedDiscountPercent: "1",
  effectivePrice: "99",
  validFrom: "2026-09-12T10:00:00.000Z",
  validUntil: "2026-09-12T11:00:00.000Z",
  status: "ACTIVE",
  executionMode: "DRY_RUN",
  priority: 80,
  baseSourceVersion: "base-v1",
  stopSourceVersion: "stop-v1",
};

describe("SDUC authorization policy", () => {
  it("selects lowest effective price, then priority, then stable id", () => {
    const selected = selectDecreaseAuthorization(
      [
        authorization,
        { ...authorization, id: "c", effectivePrice: "98", priority: 10 },
        { ...authorization, id: "a", effectivePrice: "98", priority: 90 },
      ],
      "2026-09-12T10:30:00.000Z",
    );
    expect(selected?.id).toBe("a");
  });

  it("rejects an authorization when STOP moves over its effective price", () => {
    expect(
      revalidateDecreaseAuthorization({
        authorization,
        companyId: "company-1",
        productId: "product-1",
        basePrice: "100.0",
        stopPrice: "99.01",
        currency: "usd",
        baseSourceVersion: "base-v1",
        stopSourceVersion: "stop-v1",
        mechanismEnabled: true,
        now: "2026-09-12T10:30:00.000Z",
      }),
    ).toEqual({ valid: false, reasonCode: "STOP_FLOOR_MOVED" });
  });

  it.each([
    [{ companyId: "other" }, "AUTHORIZATION_SCOPE_MISMATCH"],
    [{ mechanismEnabled: false }, "MECHANISM_DISABLED"],
    [{ basePrice: "101" }, "BASE_PRICE_CHANGED"],
    [{ currency: "MDL" }, "CURRENCY_NOT_COMPARABLE"],
    [{ stopSourceVersion: "stop-v2" }, "SOURCE_VERSION_MOVED"],
    [{ now: "2026-09-12T11:00:00.000Z" }, "AUTHORIZATION_EXPIRED"],
  ] as const)("revalidates %o deterministically", (override, reasonCode) => {
    const result = revalidateDecreaseAuthorization({
      authorization,
      companyId: "company-1",
      productId: "product-1",
      basePrice: "100",
      stopPrice: "90",
      currency: "USD",
      baseSourceVersion: "base-v1",
      stopSourceVersion: "stop-v1",
      mechanismEnabled: true,
      now: "2026-09-12T10:30:00.000Z",
      ...override,
    });
    expect(result).toEqual({ valid: false, reasonCode });
  });
});
