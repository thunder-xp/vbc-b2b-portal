import type { MaibPaymentEvidence, PaymentClaim, PaymentConfirmationResult, PaymentProviderName, PaymentReturnState } from "../types";

export type MaibReconciliationContext = Readonly<{
  attemptId: string;
  checkoutId: string;
  paymentId: string | null;
  status: string;
  amount: string;
  currency: string;
}>;

export interface RetailPaymentRepository {
  claim(input: Readonly<{ accessTokenHash: string; provider: PaymentProviderName; idempotencyKey: string }>): Promise<PaymentClaim>;
  completeCheckout(input: Readonly<{ attemptId: string; idempotencyKey: string; checkoutId: string; checkoutUrl: string; providerStatus: string }>): Promise<boolean>;
  recordFailure(input: Readonly<{ attemptId: string; idempotencyKey: string; failureCode: string; terminal: boolean }>): Promise<boolean>;
  confirmMaib(input: Readonly<{ evidence: MaibPaymentEvidence; source: "callback" | "reconciliation" }>): Promise<PaymentConfirmationResult>;
  getMaibReconciliationContext(attemptId: string): Promise<MaibReconciliationContext | null>;
  retryMaibActivation(attemptId: string): Promise<PaymentConfirmationResult>;
  getReturnState(paymentAttemptId: string): Promise<PaymentReturnState | null>;
}
