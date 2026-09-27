import { describe, expect, it, vi } from "vitest";

import type { PaymentProvider } from "../providers/payment-provider";
import type { B2bPaymentRepository } from "../repositories/b2b-payment.repository";
import { B2bPaymentService } from "../services/b2b-payment.service";

const orderId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";

describe("B2bPaymentService", () => {
  it("uses only the authoritative claim amount and currency for MAIB checkout", async () => {
    const repository = repo();
    repository.claim.mockResolvedValue({
      outcome: "CLAIMED", attemptId, amount: "1250.75", currency: "MDL",
      orderNumber: "B2B-1024", orderCreatedAt: "2026-09-27T08:00:00Z",
      locale: "ru", checkoutUrl: null,
    });
    const provider = paymentProvider();
    const result = await new B2bPaymentService(repository, provider).initiate({
      partnerOrderId: orderId, idempotencyKey, locale: "ru",
    });
    expect(provider.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      paymentAttemptId: attemptId, amount: "1250.75", currency: "MDL",
    }));
    expect(result).toMatchObject({ outcome: "SUCCESS", paymentAttemptId: attemptId });
  });

  it("does not touch persistence for invalid order identifiers", async () => {
    const repository = repo();
    const provider = paymentProvider();
    await expect(new B2bPaymentService(repository, provider).initiate({
      partnerOrderId: "browser-order", idempotencyKey, locale: "ru",
    })).resolves.toMatchObject({ outcome: "NOT_ELIGIBLE" });
    expect(repository.claim).not.toHaveBeenCalled();
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });

  it("delegates verified callback evidence without a browser-controlled paid path", async () => {
    const repository = repo();
    repository.confirmMaib.mockResolvedValue({
      outcome: "DUPLICATE", attemptId, retailOrderId: null, paymentStatus: "paid",
      activationRepeated: true, installationRequirementId: null,
    });
    const service = new B2bPaymentService(repository, paymentProvider());
    const evidence = {
      checkoutId: orderId, paymentId: idempotencyKey, orderReference: attemptId,
      checkoutAmount: "1250.75", checkoutCurrency: "MDL",
      paymentAmount: "1250.75", paymentCurrency: "MDL", paymentStatus: "Executed",
      providerEventAt: "2026-09-27T08:05:00Z", rrn: "123",
    };
    await expect(service.confirmMaibCallback(evidence)).resolves.toMatchObject({ outcome: "DUPLICATE" });
    expect(repository.confirmMaib).toHaveBeenCalledWith(evidence);
  });

  it("reconciles pending B2B checkout through the shared MAIB evidence lookup", async () => {
    const repository = repo();
    repository.getMaibReconciliationContext.mockResolvedValue({
      attemptId, checkoutId: orderId, status: "pending",
    });
    const provider = paymentProvider();
    const evidence = {
      checkoutId: orderId, paymentId: idempotencyKey, orderReference: attemptId,
      checkoutAmount: "1250.75", checkoutCurrency: "MDL",
      paymentAmount: "1250.75", paymentCurrency: "MDL", paymentStatus: "Executed",
      providerEventAt: "2026-09-27T08:05:00Z", rrn: "123",
    };
    provider.getCheckoutEvidence.mockResolvedValue(evidence);
    repository.confirmMaib.mockResolvedValue({
      outcome: "PAID", attemptId, retailOrderId: null, paymentStatus: "paid",
      activationRepeated: false, installationRequirementId: null,
    });
    await expect(new B2bPaymentService(repository, provider).reconcileMaibPayment(attemptId))
      .resolves.toMatchObject({ outcome: "PAID" });
    expect(provider.getCheckoutEvidence).toHaveBeenCalledWith(orderId);
    expect(repository.confirmMaib).toHaveBeenCalledWith(evidence);
  });
});

function repo() {
  return {
    claim: vi.fn<B2bPaymentRepository["claim"]>(),
    completeCheckout: vi.fn<B2bPaymentRepository["completeCheckout"]>().mockResolvedValue(true),
    recordFailure: vi.fn<B2bPaymentRepository["recordFailure"]>().mockResolvedValue(true),
    confirmMaib: vi.fn<B2bPaymentRepository["confirmMaib"]>(),
    getReturnState: vi.fn<B2bPaymentRepository["getReturnState"]>(),
    getMaibReconciliationContext: vi.fn<B2bPaymentRepository["getMaibReconciliationContext"]>(),
  };
}

function paymentProvider() {
  return {
    provider: "maib", createCheckout: vi.fn().mockResolvedValue({
      checkoutId: orderId, checkoutUrl: "https://checkout.maib.md/checkout",
      providerStatus: "WaitingForInit", authLatencyMs: 10, checkoutLatencyMs: 20, httpCalls: 2,
    }), getCheckoutEvidence: vi.fn(), createRefund: vi.fn(), getRefundEvidence: vi.fn(),
    getPaymentRefundState: vi.fn(),
  } satisfies PaymentProvider;
}
