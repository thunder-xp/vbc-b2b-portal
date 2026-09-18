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
const evidence = {
  checkoutId: "33333333-3333-4333-8333-333333333333",
  paymentId: "55555555-5555-4555-8555-555555555555",
  orderReference: claim.attemptId!, checkoutAmount: "99.50", checkoutCurrency: "MDL",
  paymentAmount: "99.50", paymentCurrency: "MDL", paymentStatus: "Executed",
  providerEventAt: "2026-09-16T12:00:00.000Z", rrn: "SAFE-RRN",
};

describe("RetailPaymentService", () => {
  it("uses only authoritative claimed amount and persists pending checkout", async () => {
    const { repository, provider } = dependencies();
    const result = await new RetailPaymentService(repository, provider).initiate(input);
    expect(provider.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ amount: "99.50", currency: "MDL", paymentAttemptId: claim.attemptId }));
    expect(repository.completeCheckout).toHaveBeenCalledWith(expect.objectContaining({ attemptId: claim.attemptId, checkoutId: "33333333-3333-4333-8333-333333333333" }));
    expect(result).toEqual(expect.objectContaining({ outcome: "SUCCESS", paymentAttemptId: claim.attemptId, checkoutUrl: "https://sandbox.maibmerchants.md/checkout/333", reused: false, returnAccessToken: expect.stringMatching(/^[0-9a-f]{64}$/) }));
    expect(repository.claim).toHaveBeenCalledWith(expect.objectContaining({ returnAccessTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/) }));
  });

  it.each(["NOT_ELIGIBLE", "INVALID_ORDER_STATE", "UNPRICED_ORDER", "PAYMENT_ATTEMPT_EXISTS", "TERMS_NOT_ACCEPTED", "EMAIL_REQUIRED"] as const)("does not call MAIB for %s", async (outcome) => {
    const { repository, provider } = dependencies({ ...claim, outcome });
    const result = await new RetailPaymentService(repository, provider).initiate(input);
    expect(result.outcome).toBe(outcome);
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });

  it("reuses a pending checkout for double click, refresh, or another tab", async () => {
    const pending = { ...claim, outcome: "REUSE_PENDING" as const, checkoutUrl: "https://sandbox.maibmerchants.md/checkout/existing" };
    const { repository, provider } = dependencies(pending);
    const result = await new RetailPaymentService(repository, provider).initiate(input);
    expect(result).toEqual(expect.objectContaining({ outcome: "SUCCESS", paymentAttemptId: claim.attemptId, checkoutUrl: pending.checkoutUrl, reused: true, returnAccessToken: expect.stringMatching(/^[0-9a-f]{64}$/) }));
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

  it("confirms signed callback evidence without a provider lookup", async () => {
    const { repository, provider } = dependencies();
    const result = await new RetailPaymentService(repository, provider).confirmMaibCallback(evidence);
    expect(result.outcome).toBe("PAID");
    expect(repository.confirmMaib).toHaveBeenCalledWith({ evidence, source: "callback" });
    expect(provider.getCheckoutEvidence).not.toHaveBeenCalled();
  });

  it("reconciles a missing callback with one bounded checkout lookup", async () => {
    const { repository, provider } = dependencies();
    vi.mocked(repository.getMaibReconciliationContext).mockResolvedValue({ attemptId: claim.attemptId!, checkoutId: evidence.checkoutId, paymentId: null, status: "pending", amount: "99.50", currency: "MDL" });
    vi.mocked(provider.getCheckoutEvidence).mockResolvedValue(evidence);
    const result = await new RetailPaymentService(repository, provider).reconcileMaibPayment(claim.attemptId!);
    expect(result.outcome).toBe("PAID");
    expect(provider.getCheckoutEvidence).toHaveBeenCalledTimes(1);
    expect(repository.confirmMaib).toHaveBeenCalledWith({ evidence, source: "reconciliation" });
  });

  it("recovers paid_pending_activation locally without contacting MAIB again", async () => {
    const { repository, provider } = dependencies();
    vi.mocked(repository.getMaibReconciliationContext).mockResolvedValue({ attemptId: claim.attemptId!, checkoutId: evidence.checkoutId, paymentId: evidence.paymentId, status: "paid_pending_activation", amount: "99.50", currency: "MDL" });
    const result = await new RetailPaymentService(repository, provider).reconcileMaibPayment(claim.attemptId!);
    expect(result.outcome).toBe("PAID");
    expect(repository.retryMaibActivation).toHaveBeenCalledWith(claim.attemptId);
    expect(provider.getCheckoutEvidence).not.toHaveBeenCalled();
  });
});

function dependencies(claimResult: PaymentClaim = claim) {
  const repository: RetailPaymentRepository = {
    claim: vi.fn().mockResolvedValue(claimResult),
    completeCheckout: vi.fn().mockResolvedValue(true),
    recordFailure: vi.fn().mockResolvedValue(true),
    confirmMaib: vi.fn().mockResolvedValue({ outcome: "PAID", attemptId: claim.attemptId, retailOrderId: "44444444-4444-4444-8444-444444444444", paymentStatus: "paid", activationRepeated: false, installationRequirementId: null }),
    getMaibReconciliationContext: vi.fn().mockResolvedValue(null),
    retryMaibActivation: vi.fn().mockResolvedValue({ outcome: "PAID", attemptId: claim.attemptId, retailOrderId: "44444444-4444-4444-8444-444444444444", paymentStatus: "paid", activationRepeated: true, installationRequirementId: null }),
    getReturnState: vi.fn().mockResolvedValue(null),
    persistPaidConfirmationEmail: vi.fn().mockResolvedValue("QUEUED"),
    listOrderPaymentStates: vi.fn().mockResolvedValue([]),
    getOrderPaymentStateByNumber: vi.fn().mockResolvedValue(null),
    listRecentPaymentStates: vi.fn().mockResolvedValue([]),
    claimRefund: vi.fn(),
    startRefundRequest: vi.fn(),
    assignProviderRefund: vi.fn(),
    recordRefundFailure: vi.fn(),
    getRefundContext: vi.fn(),
    reconcileRefund: vi.fn(),
  };
  const provider: PaymentProvider = {
    provider: "maib",
    createCheckout: vi.fn().mockResolvedValue({ checkoutId: "33333333-3333-4333-8333-333333333333", checkoutUrl: "https://sandbox.maibmerchants.md/checkout/333", providerStatus: "WaitingForInit", authLatencyMs: 10, checkoutLatencyMs: 20, httpCalls: 2 }),
    getCheckoutEvidence: vi.fn(),
    createRefund: vi.fn(),
    getRefundEvidence: vi.fn(),
    getPaymentRefundState: vi.fn(),
  };
  return { repository, provider };
}
