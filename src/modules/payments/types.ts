export type PaymentProviderName = "maib";
export type PaymentAttemptStatus = "created" | "pending" | "paid" | "failed" | "cancelled" | "expired";

export type PaymentInitiationOutcome =
  | "NOT_ELIGIBLE"
  | "INVALID_ORDER_STATE"
  | "UNPRICED_ORDER"
  | "PAYMENT_ATTEMPT_EXISTS"
  | "MAIB_AUTH_FAILED"
  | "MAIB_CHECKOUT_FAILED"
  | "PERSISTENCE_FAILED"
  | "CONFIGURATION_ERROR"
  | "SUCCESS";

export type PaymentClaimOutcome =
  | "NOT_ELIGIBLE"
  | "INVALID_ORDER_STATE"
  | "UNPRICED_ORDER"
  | "PAYMENT_ATTEMPT_EXISTS"
  | "CLAIMED"
  | "REUSE_PENDING";

export type PaymentClaim = Readonly<{
  outcome: PaymentClaimOutcome;
  attemptId: string | null;
  amount: string | null;
  currency: string | null;
  orderNumber: string | null;
  orderCreatedAt: string | null;
  locale: "ru" | "ro" | null;
  checkoutUrl: string | null;
}>;

export type PaymentCheckoutInput = Readonly<{
  paymentAttemptId: string;
  orderNumber: string;
  orderCreatedAt: string;
  amount: string;
  currency: "MDL";
  locale: "ru" | "ro";
}>;

export type PaymentCheckoutResult = Readonly<{
  checkoutId: string;
  checkoutUrl: string;
  providerStatus: string;
  authLatencyMs: number;
  checkoutLatencyMs: number;
  httpCalls: 2;
}>;

export type PaymentInitiationResult = Readonly<{
  outcome: PaymentInitiationOutcome;
  paymentAttemptId: string | null;
  checkoutUrl: string | null;
  reused: boolean;
}>;
