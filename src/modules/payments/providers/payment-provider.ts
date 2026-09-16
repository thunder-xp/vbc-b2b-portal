import type { MaibPaymentEvidence, PaymentCheckoutInput, PaymentCheckoutResult, PaymentProviderName } from "../types";

export interface PaymentProvider {
  readonly provider: PaymentProviderName;
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult>;
  getCheckoutEvidence(checkoutId: string): Promise<MaibPaymentEvidence>;
}

export class PaymentProviderError extends Error {
  constructor(
    readonly stage: "configuration" | "auth" | "checkout" | "lookup",
    readonly safeCode: string,
    readonly ambiguous: boolean,
    readonly httpStatus: number | null = null,
  ) {
    super(`Payment provider ${stage} failed.`);
    this.name = "PaymentProviderError";
  }
}
