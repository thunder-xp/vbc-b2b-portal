export type PaymentProviderName = "maib";
export type PaymentAttemptStatus = "created" | "pending" | "paid_pending_activation" | "paid" | "failed" | "cancelled" | "expired";
export type PaymentRefundStatus = "created" | "pending" | "refunded" | "failed";
export type EffectivePaymentState = "UNPAID" | "PAYMENT_PENDING" | "PAID" | "REFUND_PENDING" | "REFUNDED" | "FAILED" | "CANCELLED";

export type RetailOrderPaymentState = Readonly<{
  retailOrderId: string;
  orderNumber: string;
  paymentAttemptId: string | null;
  provider: PaymentProviderName | null;
  attemptStatus: PaymentAttemptStatus | null;
  paymentState: EffectivePaymentState;
  amount: string | null;
  currency: string | null;
  providerStatus: string | null;
  providerCheckoutId: string | null;
  providerPaymentId: string | null;
  providerRrn: string | null;
  failureCode: string | null;
  paymentCreatedAt: string | null;
  paymentConfirmedAt: string | null;
  refundId: string | null;
  refundStatus: PaymentRefundStatus | null;
  refundProviderStatus: string | null;
  providerRefundId: string | null;
  refundFailureCode: string | null;
  refundRequestedAt: string | null;
  refundConfirmedAt: string | null;
  remainingRefundable: string | null;
  reconciliationLastAt: string | null;
  reconciliationNextAt: string | null;
  reconciliationLastOutcome: string | null;
  reconciliationErrorCode: string | null;
  lastProviderOutcome: string | null;
  lastPaymentEventType: string | null;
}>;

export type PaymentInitiationOutcome =
  | "NOT_ELIGIBLE"
  | "INVALID_ORDER_STATE"
  | "UNPRICED_ORDER"
  | "PAYMENT_ATTEMPT_EXISTS"
  | "TERMS_NOT_ACCEPTED"
  | "EMAIL_REQUIRED"
  | "CONTENT_NOT_ELIGIBLE"
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
  | "TERMS_NOT_ACCEPTED"
  | "EMAIL_REQUIRED"
  | "CONTENT_NOT_ELIGIBLE"
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
  returnAccessToken: string | null;
}>;

export type MaibPaymentEvidence = Readonly<{
  checkoutId: string;
  paymentId: string;
  orderReference: string;
  checkoutAmount: string;
  checkoutCurrency: string;
  paymentAmount: string;
  paymentCurrency: string;
  paymentStatus: string;
  providerEventAt: string;
  rrn: string | null;
}>;

export type MaibCheckoutState =
  | Readonly<{ kind: "payment"; evidence: MaibPaymentEvidence }>
  | Readonly<{
      kind: "pending" | "terminal";
      checkoutId: string;
      orderReference: string;
      amount: string;
      currency: string;
      checkoutStatus: "WaitingForInit" | "Initialized" | "PaymentMethodSelected" | "Expired" | "Abandoned" | "Cancelled" | "Failed";
      providerEventAt: string;
    }>;

export type PaymentConfirmationOutcome =
  | "PAID"
  | "DUPLICATE"
  | "PAID_PENDING_ACTIVATION"
  | "NON_PAID"
  | "UNKNOWN_CHECKOUT"
  | "PAYMENT_MISMATCH"
  | "ORDER_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "INVALID_EVIDENCE";

export type PaymentConfirmationResult = Readonly<{
  outcome: PaymentConfirmationOutcome;
  attemptId: string | null;
  retailOrderId: string | null;
  paymentStatus: PaymentAttemptStatus | null;
  activationRepeated: boolean | null;
  installationRequirementId: string | null;
}>;

export type PaymentReconciliationOutcome = PaymentConfirmationOutcome | "PENDING" | "EXPIRED" | "CANCELLED" | "FAILED";

export type PaymentReconciliationResult = Omit<PaymentConfirmationResult, "outcome"> & Readonly<{
  outcome: PaymentReconciliationOutcome;
}>;

export type PaymentReconciliationBatchResult = Readonly<{
  claimed: number;
  paid: number;
  pending: number;
  terminal: number;
  retried: number;
}>;

export type PaymentReturnState = Readonly<{
  status: "PROCESSING" | "PAID" | "REFUND_PENDING" | "REFUNDED" | "FAILED" | "CANCELLED";
  locale: "ru" | "ro";
  orderNumber: string;
  amount: string;
  currency: string;
  confirmedAt: string | null;
  items: ReadonlyArray<{ name: string; sku: string; quantity: number }>;
}>;

export type PaymentRefundClaimOutcome =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "NOT_REFUNDABLE"
  | "MISSING_PROVIDER_PAYMENT_ID"
  | "IDEMPOTENCY_CONFLICT"
  | "ALREADY_REFUNDED"
  | "CLAIMED"
  | "REUSE";

export type PaymentRefundClaim = Readonly<{
  outcome: PaymentRefundClaimOutcome;
  refundId: string | null;
  paymentAttemptId: string | null;
  providerPaymentId: string | null;
  providerRefundId: string | null;
  amount: string | null;
  currency: string | null;
  reason: string | null;
  status: PaymentRefundStatus | null;
  providerStatus: string | null;
  providerRequestStarted: boolean;
  failureCode: string | null;
}>;

export type PaymentRefundProviderInput = Readonly<{
  paymentId: string;
  amount: string;
  currency: "MDL";
  reason: string;
}>;

export type PaymentRefundProviderResult = Readonly<{
  refundId: string;
  providerStatus: string;
  authLatencyMs: number;
  refundLatencyMs: number;
  httpCalls: number;
}>;

export type PaymentRefundEvidence = Readonly<{
  refundId: string;
  paymentId: string;
  refundType: "Full" | "Partial";
  amount: string;
  currency: string;
  reason: string;
  status: "Created" | "Requested" | "Accepted" | "Rejected" | "Manual";
  executedAt: string | null;
}>;

export type PaymentProviderRefundState = Readonly<{
  paymentId: string;
  status: "Executed" | "PartiallyRefunded" | "Refunded" | "Failed";
  amount: string;
  currency: string;
  refundedAmount: string;
  requestedRefundAmount: string;
  refundableAmount: string;
  isRefundable: boolean;
}>;

export type PaymentRefundOutcome =
  | PaymentRefundClaimOutcome
  | "PROVIDER_FAILED"
  | "AMBIGUOUS_PROVIDER_RESULT"
  | "PERSISTENCE_FAILED"
  | "PENDING"
  | "REFUNDED"
  | "FAILED"
  | "EVIDENCE_MISMATCH"
  | "DUPLICATE";

export type PaymentRefundResult = Readonly<{
  outcome: PaymentRefundOutcome;
  refundId: string | null;
  providerRefundId: string | null;
  status: PaymentRefundStatus | null;
  providerStatus: string | null;
  amount: string | null;
  currency: string | null;
  remainingRefundable: string | null;
  confirmedAt: string | null;
  reused: boolean;
}>;
