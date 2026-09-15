import { describe, expect, it, vi } from "vitest";

import { PaymentProviderError, type PaymentProvider } from "../providers/payment-provider";
import type { RetailPaymentRepository } from "../repositories/retail-payment.repository";
import { RetailPaymentService } from "../services/retail-payment.service";
import type { PaymentClaim } from "../types";

const input = { accessTokenHash: "a".repeat(64), idempotencyKey: "11111111-1111-4111-8111-111111111111" };
const claim: PaymentClaim = {
  outcome: "CLAIMED",
  attemptId: "22222222-2222-4222-8222-222222222222",
  amount: "99.50",
  currency: "MDL",
  orderNumber: "R-1",
  orderCreatedAt: "2026-09-15T10:00:00.000Z",
  locale: "ro",
  checkoutUrl: null,
};

describe("RetailPaymentService", () => {
  it("uses only authoritative claimed amount and persists pending checkout", async () => {
    const { repository, provider } = dependencies();
    const result = await new RetailPaymentService(repository, provider).initiate(input);
    expect(provider.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ amount: "99.50", currency: "MDL", paymentAttemptId: claim.attemptId }));
    expect(repository.completeCheckout).toHaveBeenCalledWith(expect.objectContaining({ attemptId: claim.attemptId, checkoutId: "33333333-3333-4333-8333-333333333333" }));
    expect(result).toEqual({ outcome: "SUCCESS", paymentAttemptId: claim.attemptId, checkoutUrl: "https://sandbox.maibmerchants.md/checkout/333", reused: false });
  });

  it.each(["NOT_ELIGIBLE", "INVALID_ORDER_STATE", "UNPRICED_ORDER", "PAYMENT_ATTEMPT_EXISTS"] as const)("does not call MAIB for %s", async (outcome) => {
    const { repository, provider } = dependencies({ ...claim, outcome });
    const result = await new RetailPaymentService(repository, provider).initiate(input);
    expect(result.outcome).toBe(outcome);
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });

  it("reuses a pending checkout for double click, refresh, or another tab", async () => {
    const pending = { ...claim, outcome: "REUSE_PENDING" as const, checkoutUrl: "https://sandbox.maibmerchants.md/checkout/existing" };
    const { repository, provider } = dependencies(pending);
    const result = await new RetailPaymentService(repository, provider).initiate(input);
    expect(result).toEqual({ outcome: "SUCCESS", paymentAttemptId: claim.attemptId, checkoutUrl: pending.checkoutUrl, reused: true });
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });

  it("keeps an ambiguous checkout attempt active and blocks an uncontrolled retry", async () => {
    const { repository, provider } = dependencies();
    vi.mocked(provider.createCheckout).mockRejectedValue(new PaymentProviderError("checkout", "HTTP_500", true, 500));
    const result = await new RetailPaymentService(repository, provider).initiate(input);
    expect(result.outcome).toBe("MAIB_CHECKOUT_FAILED");
    expect(repository.recordFailure).toHaveBeenCalledWith(expect.objectContaining({ terminal: false, failureCode: "CHECKOUT:HTTP_500" }));
  });

  it("maps a clear OAuth rejection and persistence failure separately", async () => {
    const first = dependencies();
    vi.mocked(first.provider.createCheckout).mockRejectedValue(new PaymentProviderError("auth", "INVALID_CLIENT", false, 401));
    expect((await new RetailPaymentService(first.repository, first.provider).initiate(input)).outcome).toBe("MAIB_AUTH_FAILED");
    expect(first.repository.recordFailure).toHaveBeenCalledWith(expect.objectContaining({ terminal: true }));

    const second = dependencies();
    vi.mocked(second.repository.completeCheckout).mockResolvedValue(false);
    expect((await new RetailPaymentService(second.repository, second.provider).initiate(input)).outcome).toBe("PERSISTENCE_FAILED");
  });
});

function dependencies(claimResult: PaymentClaim = claim) {
  const repository: RetailPaymentRepository = {
    claim: vi.fn().mockResolvedValue(claimResult),
    completeCheckout: vi.fn().mockResolvedValue(true),
    recordFailure: vi.fn().mockResolvedValue(true),
  };
  const provider: PaymentProvider = {
    provider: "maib",
    createCheckout: vi.fn().mockResolvedValue({ checkoutId: "33333333-3333-4333-8333-333333333333", checkoutUrl: "https://sandbox.maibmerchants.md/checkout/333", providerStatus: "WaitingForInit", authLatencyMs: 10, checkoutLatencyMs: 20, httpCalls: 2 }),
  };
  return { repository, provider };
}
