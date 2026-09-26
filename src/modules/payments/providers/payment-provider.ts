import type {
  MaibPaymentEvidence,
  MaibCheckoutState,
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProviderName,
  PaymentProviderRefundState,
  PaymentRefundEvidence,
  PaymentRefundProviderInput,
  PaymentRefundProviderResult,
} from "../types";

export interface PaymentProvider {
  readonly provider: PaymentProviderName;
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult>;
  getCheckoutEvidence(checkoutId: string): Promise<MaibPaymentEvidence>;
  getCheckoutState(checkoutId: string): Promise<MaibCheckoutState>;
  createRefund(input: PaymentRefundProviderInput): Promise<PaymentRefundProviderResult>;
  getRefundEvidence(refundId: string): Promise<PaymentRefundEvidence>;
  getPaymentRefundState(paymentId: string): Promise<PaymentProviderRefundState>;
}

export class PaymentProviderError extends Error {
  constructor(
    readonly stage: "configuration" | "auth" | "checkout" | "lookup" | "refund" | "refund_lookup" | "payment_lookup",
    readonly safeCode: string,
    readonly ambiguous: boolean,
    readonly httpStatus: number | null = null,
  ) {
    super(`Payment provider ${stage} failed.`);
    this.name = "PaymentProviderError";
  }
}
