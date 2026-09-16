import { describe, expect, it } from "vitest";

import { parseMaibCallback } from "../providers/maib/maib-callback";

const callback = {
  checkoutId: "11111111-1111-4111-8111-111111111111",
  amount: 99.5,
  currency: "MDL",
  orderId: "22222222-2222-4222-8222-222222222222",
  paymentId: "33333333-3333-4333-8333-333333333333",
  paymentAmount: 99.5,
  paymentCurrency: "MDL",
  paymentStatus: "Executed",
  paymentExecutedAt: "2026-09-16T12:30:00.000Z",
  retrievalReferenceNumber: "SAFE-RRN",
  senderCardNumber: "444433******1111",
};

describe("MAIB callback parser", () => {
  it("projects only bounded commercial evidence and drops card/payer fields", () => {
    expect(parseMaibCallback(Buffer.from(JSON.stringify(callback)))).toEqual({
      checkoutId: callback.checkoutId, paymentId: callback.paymentId, orderReference: callback.orderId,
      checkoutAmount: "99.50", checkoutCurrency: "MDL", paymentAmount: "99.50", paymentCurrency: "MDL",
      paymentStatus: "Executed", providerEventAt: callback.paymentExecutedAt, rrn: "SAFE-RRN",
    });
    expect(JSON.stringify(parseMaibCallback(Buffer.from(JSON.stringify(callback))))).not.toContain("444433");
  });

  it.each([
    { ...callback, checkoutId: "bad" },
    { ...callback, orderId: null },
    { ...callback, paymentAmount: 99.501 },
    { ...callback, paymentExecutedAt: "not-a-date" },
  ])("rejects malformed evidence", (payload) => {
    expect(parseMaibCallback(Buffer.from(JSON.stringify(payload)))).toBeNull();
  });
});
