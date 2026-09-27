import type {
  MaibPaymentEvidence,
  PaymentClaim,
  PaymentConfirmationResult,
  PaymentProviderName,
  PaymentReturnState,
} from "../types";

export interface B2bPaymentRepository {
  claim(input: Readonly<{
    partnerOrderId: string;
    provider: PaymentProviderName;
    idempotencyKey: string;
    returnAccessTokenHash: string;
    locale: "ru" | "ro";
  }>): Promise<PaymentClaim>;
  completeCheckout(input: Readonly<{
    attemptId: string;
    idempotencyKey: string;
    checkoutId: string;
    checkoutUrl: string;
    providerStatus: string;
  }>): Promise<boolean>;
  recordFailure(input: Readonly<{
    attemptId: string;
    idempotencyKey: string;
    failureCode: string;
    terminal: boolean;
  }>): Promise<boolean>;
  confirmMaib(evidence: MaibPaymentEvidence): Promise<PaymentConfirmationResult>;
  getMaibReconciliationContext(paymentAttemptId: string): Promise<Readonly<{
    attemptId: string;
    checkoutId: string;
    status: string;
  }> | null>;
  getReturnState(
    paymentAttemptId: string,
    returnAccessTokenHash: string,
  ): Promise<PaymentReturnState | null>;
}
