import { createHash } from "node:crypto";

import type { PaymentProvider } from "../providers/payment-provider";
import type { B2bPaymentRepository } from "../repositories/b2b-payment.repository";
import type {
  MaibPaymentEvidence,
  PaymentConfirmationResult,
  PaymentInitiationResult,
  PaymentReturnState,
} from "../types";
import { initiatePaymentCheckout } from "./payment-checkout.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/;

export class B2bPaymentService {
  constructor(
    private readonly repository: B2bPaymentRepository,
    private readonly provider: PaymentProvider,
  ) {}

  async initiate(input: Readonly<{
    partnerOrderId: string;
    idempotencyKey: string;
    locale: "ru" | "ro";
  }>): Promise<PaymentInitiationResult> {
    if (!UUID.test(input.partnerOrderId) || !UUID.test(input.idempotencyKey)) {
      return failure("NOT_ELIGIBLE");
    }
    return initiatePaymentCheckout(this.provider, {
      claim: (returnAccessTokenHash) => this.repository.claim({
        ...input,
        provider: this.provider.provider,
        returnAccessTokenHash,
      }),
      complete: (checkout) => this.repository.completeCheckout({
        ...checkout,
        idempotencyKey: input.idempotencyKey,
      }),
      fail: (failureInput) => this.repository.recordFailure({
        ...failureInput,
        idempotencyKey: input.idempotencyKey,
      }),
    });
  }

  confirmMaibCallback(evidence: MaibPaymentEvidence): Promise<PaymentConfirmationResult> {
    return this.repository.confirmMaib(evidence);
  }

  async reconcileMaibPayment(paymentAttemptId: string): Promise<PaymentConfirmationResult> {
    if (!UUID.test(paymentAttemptId)) return confirmation("INVALID_EVIDENCE");
    const context = await this.repository.getMaibReconciliationContext(paymentAttemptId);
    if (!context) return confirmation("INVALID_EVIDENCE");
    if (context.status === "paid") {
      return { ...confirmation("DUPLICATE"), attemptId: context.attemptId,
        paymentStatus: "paid", activationRepeated: true };
    }
    return this.repository.confirmMaib(
      await this.provider.getCheckoutEvidence(context.checkoutId),
    );
  }

  getReturnState(paymentAttemptId: string, returnAccessToken: string): Promise<PaymentReturnState | null> {
    if (!UUID.test(paymentAttemptId) || !TOKEN.test(returnAccessToken)) {
      return Promise.resolve(null);
    }
    return this.repository.getReturnState(
      paymentAttemptId,
      createHash("sha256").update(returnAccessToken).digest("hex"),
    );
  }
}

function failure(outcome: Exclude<PaymentInitiationResult["outcome"], "SUCCESS">): PaymentInitiationResult {
  return {
    outcome,
    paymentAttemptId: null,
    checkoutUrl: null,
    reused: false,
    returnAccessToken: null,
  };
}

function confirmation(outcome: PaymentConfirmationResult["outcome"]): PaymentConfirmationResult {
  return { outcome, attemptId: null, retailOrderId: null, paymentStatus: null,
    activationRepeated: null, installationRequirementId: null };
}
