import type { PaymentClaim, PaymentProviderName } from "../types";

export interface RetailPaymentRepository {
  claim(input: Readonly<{ accessTokenHash: string; provider: PaymentProviderName; idempotencyKey: string }>): Promise<PaymentClaim>;
  completeCheckout(input: Readonly<{ attemptId: string; idempotencyKey: string; checkoutId: string; checkoutUrl: string; providerStatus: string }>): Promise<boolean>;
  recordFailure(input: Readonly<{ attemptId: string; idempotencyKey: string; failureCode: string; terminal: boolean }>): Promise<boolean>;
}
