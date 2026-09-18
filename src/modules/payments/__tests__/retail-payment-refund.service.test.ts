import { describe, expect, it, vi } from "vitest";

import { PaymentProviderError, type PaymentProvider } from "../providers/payment-provider";
import type { RetailPaymentRepository } from "../repositories/retail-payment.repository";
import { RetailPaymentService } from "../services/retail-payment.service";
import type { PaymentRefundClaim } from "../types";

const paymentAttemptId = "11111111-1111-4111-8111-111111111111";
const refundId = "22222222-2222-4222-8222-222222222222";
const providerPaymentId = "33333333-3333-4333-8333-333333333333";
const providerRefundId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const input = { paymentAttemptId, reason: "MAIB integration certification test refund", idempotencyKey };

const claim: PaymentRefundClaim = {
  outcome: "CLAIMED", refundId, paymentAttemptId, providerPaymentId, providerRefundId: null,
  amount: "3641.00", currency: "MDL", reason: input.reason, status: "created",
  providerStatus: null, providerRequestStarted: false, failureCode: null,
};
const pending = { ...claim, outcome: "REUSE" as const, providerRefundId, status: "pending" as const, providerStatus: "Created", providerRequestStarted: true };
const refundEvidence = {
  refundId: providerRefundId, paymentId: providerPaymentId, refundType: "Full" as const,
  amount: "3641.00", currency: "MDL", reason: input.reason, status: "Accepted" as const,
  executedAt: "2026-09-16T20:00:00.000Z",
};
const paymentEvidence = {
  paymentId: providerPaymentId, status: "Refunded" as const, amount: "3641.00", currency: "MDL",
  refundedAmount: "3641.00", requestedRefundAmount: "3641.00", refundableAmount: "0.00", isRefundable: false,
};

describe("RetailPaymentService refund lifecycle", () => {
  it("derives the full amount from the locked claim and confirms only authoritative final evidence", async () => {
    const { repository, provider } = dependencies();
    const result = await new RetailPaymentService(repository, provider).refundRetailPayment(input);
    expect(provider.createRefund).toHaveBeenCalledWith({ paymentId: providerPaymentId, amount: "3641.00", currency: "MDL", reason: input.reason });
    expect(repository.startRefundRequest).toHaveBeenCalledBefore(vi.mocked(provider.createRefund));
    expect(repository.assignProviderRefund).toHaveBeenCalledWith({ refundId, providerRefundId, providerStatus: "Created" });
    expect(repository.reconcileRefund).toHaveBeenCalledWith({ refundId, refund: refundEvidence, payment: paymentEvidence });
    expect(result).toMatchObject({ outcome: "REFUNDED", refundId, providerRefundId, remainingRefundable: "0.00" });
  });

  it.each(["NOT_REFUNDABLE", "MISSING_PROVIDER_PAYMENT_ID", "ALREADY_REFUNDED"] as const)("rejects %s before any provider call", async (outcome) => {
    const { repository, provider } = dependencies({ ...emptyClaim(outcome), outcome });
    const result = await new RetailPaymentService(repository, provider).refundRetailPayment(input);
    expect(result.outcome).toBe(outcome);
    expect(provider.createRefund).not.toHaveBeenCalled();
  });

  it("reuses the durable active refund under duplicate or concurrent requests", async () => {
    const { repository, provider } = dependencies(pending);
    const result = await new RetailPaymentService(repository, provider).refundRetailPayment({ ...input, idempotencyKey: "66666666-6666-4666-8666-666666666666" });
    expect(provider.createRefund).not.toHaveBeenCalled();
    expect(provider.getRefundEvidence).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ outcome: "REFUNDED", reused: true });
  });

  it("blocks a second POST after an ambiguous provider result", async () => {
    const first = dependencies();
    vi.mocked(first.provider.createRefund).mockRejectedValue(new PaymentProviderError("refund", "REFUND_NETWORK_ERROR", true));
    expect((await new RetailPaymentService(first.repository, first.provider).refundRetailPayment(input)).outcome).toBe("AMBIGUOUS_PROVIDER_RESULT");
    expect(first.repository.recordRefundFailure).toHaveBeenCalledWith({ refundId, failureCode: "REFUND:REFUND_NETWORK_ERROR", terminal: false });

    const ambiguous = { ...pending, providerRefundId: null, failureCode: "REFUND:REFUND_NETWORK_ERROR" };
    const second = dependencies(ambiguous);
    expect((await new RetailPaymentService(second.repository, second.provider).refundRetailPayment(input)).outcome).toBe("AMBIGUOUS_PROVIDER_RESULT");
    expect(second.provider.createRefund).not.toHaveBeenCalled();
  });

  it("keeps a provider rejection separate from the historical paid PaymentAttempt", async () => {
    const { repository, provider } = dependencies(pending);
    vi.mocked(provider.getRefundEvidence).mockResolvedValue({ ...refundEvidence, status: "Rejected", executedAt: null });
    vi.mocked(provider.getPaymentRefundState).mockResolvedValue({ ...paymentEvidence, status: "Executed", refundedAmount: "0.00", requestedRefundAmount: "0.00", refundableAmount: "3641.00", isRefundable: true });
    vi.mocked(repository.reconcileRefund).mockResolvedValue({ outcome: "FAILED", refundId, providerRefundId: null, status: "failed", providerStatus: null, amount: null, currency: null, remainingRefundable: null, confirmedAt: null, reused: false });
    const result = await new RetailPaymentService(repository, provider).refundRetailPayment(input);
    expect(result.outcome).toBe("FAILED");
    expect(repository.confirmMaib).not.toHaveBeenCalled();
    expect(repository.retryMaibActivation).not.toHaveBeenCalled();
  });

  it("keeps reconciliation failures pending without issuing a second refund", async () => {
    const { repository, provider } = dependencies(pending);
    vi.mocked(provider.getRefundEvidence).mockRejectedValue(new PaymentProviderError("refund_lookup", "HTTP_503", true, 503));
    const result = await new RetailPaymentService(repository, provider).reconcileRetailPaymentRefund(refundId);
    expect(result.outcome).toBe("PENDING");
    expect(repository.recordRefundFailure).toHaveBeenCalledWith({ refundId, failureCode: "REFUND_LOOKUP:HTTP_503", terminal: false });
    expect(provider.createRefund).not.toHaveBeenCalled();
  });
});

function emptyClaim(outcome: PaymentRefundClaim["outcome"]): PaymentRefundClaim {
  return { outcome, refundId: null, paymentAttemptId: null, providerPaymentId: null, providerRefundId: null, amount: null, currency: null, reason: null, status: null, providerStatus: null, providerRequestStarted: false, failureCode: null };
}

function dependencies(claimResult: PaymentRefundClaim = claim) {
  const repository: RetailPaymentRepository = {
    claim: vi.fn(), completeCheckout: vi.fn(), recordFailure: vi.fn(), confirmMaib: vi.fn(),
    getMaibReconciliationContext: vi.fn(), retryMaibActivation: vi.fn(), getReturnState: vi.fn(), persistPaidConfirmationEmail: vi.fn(),
    listOrderPaymentStates: vi.fn().mockResolvedValue([]), getOrderPaymentStateByNumber: vi.fn().mockResolvedValue(null), listRecentPaymentStates: vi.fn().mockResolvedValue([]),
    claimRefund: vi.fn().mockResolvedValue(claimResult),
    startRefundRequest: vi.fn().mockResolvedValue(true),
    assignProviderRefund: vi.fn().mockResolvedValue(true),
    recordRefundFailure: vi.fn().mockResolvedValue(true),
    getRefundContext: vi.fn().mockResolvedValue(pending),
    reconcileRefund: vi.fn().mockResolvedValue({ outcome: "REFUNDED", refundId, providerRefundId: null, status: "refunded", providerStatus: null, amount: null, currency: null, remainingRefundable: "0.00", confirmedAt: refundEvidence.executedAt, reused: false }),
  };
  const provider: PaymentProvider = {
    provider: "maib", createCheckout: vi.fn(), getCheckoutEvidence: vi.fn(),
    createRefund: vi.fn().mockResolvedValue({ refundId: providerRefundId, providerStatus: "Created", authLatencyMs: 5, refundLatencyMs: 10, httpCalls: 2 }),
    getRefundEvidence: vi.fn().mockResolvedValue(refundEvidence),
    getPaymentRefundState: vi.fn().mockResolvedValue(paymentEvidence),
  };
  return { repository, provider };
}
