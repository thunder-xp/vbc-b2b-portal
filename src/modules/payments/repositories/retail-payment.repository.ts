import type {
  MaibPaymentEvidence,
  PaymentClaim,
  PaymentConfirmationResult,
  PaymentProviderName,
  PaymentRefundClaim,
  PaymentRefundEvidence,
  PaymentRefundResult,
  PaymentProviderRefundState,
  PaymentReturnState,
  RetailOrderPaymentState,
} from "../types";

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
  listOrderPaymentStates(retailOrderIds: string[]): Promise<RetailOrderPaymentState[]>;
  getOrderPaymentStateByNumber(orderNumber: string): Promise<RetailOrderPaymentState | null>;
  listRecentPaymentStates(limit: number): Promise<RetailOrderPaymentState[]>;
  claimRefund(input: Readonly<{ paymentAttemptId: string; reason: string; idempotencyKey: string }>): Promise<PaymentRefundClaim>;
  startRefundRequest(refundId: string): Promise<boolean>;
  assignProviderRefund(input: Readonly<{ refundId: string; providerRefundId: string; providerStatus: string }>): Promise<boolean>;
  recordRefundFailure(input: Readonly<{ refundId: string; failureCode: string; terminal: boolean }>): Promise<boolean>;
  getRefundContext(refundId: string): Promise<PaymentRefundClaim | null>;
  reconcileRefund(input: Readonly<{
    refundId: string;
    refund: PaymentRefundEvidence;
    payment: PaymentProviderRefundState;
  }>): Promise<PaymentRefundResult>;
}
