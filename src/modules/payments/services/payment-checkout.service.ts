import { randomBytes, createHash } from "node:crypto";

import type { PaymentProvider } from "../providers/payment-provider";
import { PaymentProviderError } from "../providers/payment-provider";
import type { PaymentClaim, PaymentInitiationResult } from "../types";

export type PaymentCheckoutPersistence = Readonly<{
  claim(returnAccessTokenHash: string): Promise<PaymentClaim>;
  complete(input: Readonly<{
    attemptId: string;
    checkoutId: string;
    checkoutUrl: string;
    providerStatus: string;
  }>): Promise<boolean>;
  fail(input: Readonly<{
    attemptId: string;
    failureCode: string;
    terminal: boolean;
  }>): Promise<boolean>;
}>;

export async function initiatePaymentCheckout(
  provider: PaymentProvider,
  persistence: PaymentCheckoutPersistence,
): Promise<PaymentInitiationResult> {
  const returnAccessToken = randomBytes(32).toString("hex");
  const returnAccessTokenHash = createHash("sha256")
    .update(returnAccessToken)
    .digest("hex");
  let claim: PaymentClaim;
  try {
    claim = await persistence.claim(returnAccessTokenHash);
  } catch {
    return result("PERSISTENCE_FAILED");
  }

  if (claim.outcome === "REUSE_PENDING") {
    return {
      outcome: "SUCCESS",
      paymentAttemptId: claim.attemptId,
      checkoutUrl: claim.checkoutUrl,
      reused: true,
      returnAccessToken,
    };
  }
  if (claim.outcome !== "CLAIMED") return result(claim.outcome);
  if (!claim.attemptId || !claim.amount || claim.currency !== "MDL"
    || !claim.orderNumber || !claim.orderCreatedAt || !claim.locale) {
    return result("PERSISTENCE_FAILED", claim.attemptId);
  }

  try {
    const checkout = await provider.createCheckout({
      paymentAttemptId: claim.attemptId,
      orderNumber: claim.orderNumber,
      orderCreatedAt: claim.orderCreatedAt,
      amount: claim.amount,
      currency: "MDL",
      locale: claim.locale,
    });
    const persisted = await persistence.complete({
      attemptId: claim.attemptId,
      checkoutId: checkout.checkoutId,
      checkoutUrl: checkout.checkoutUrl,
      providerStatus: checkout.providerStatus,
    });
    if (!persisted) return result("PERSISTENCE_FAILED", claim.attemptId);
    return {
      outcome: "SUCCESS",
      paymentAttemptId: claim.attemptId,
      checkoutUrl: checkout.checkoutUrl,
      reused: false,
      returnAccessToken,
    };
  } catch (error) {
    const providerError = error instanceof PaymentProviderError ? error : null;
    const failureCode = normalizeFailureCode(providerError
      ? `${providerError.stage}:${providerError.safeCode}`
      : "UNEXPECTED_PROVIDER_ERROR");
    const terminal = providerError
      ? providerError.stage === "configuration" || !providerError.ambiguous
      : false;
    try {
      const persisted = await persistence.fail({
        attemptId: claim.attemptId,
        failureCode,
        terminal,
      });
      if (!persisted) return result("PERSISTENCE_FAILED", claim.attemptId);
    } catch {
      return result("PERSISTENCE_FAILED", claim.attemptId);
    }
    if (providerError?.stage === "configuration") {
      return result("CONFIGURATION_ERROR", claim.attemptId);
    }
    return result(
      providerError?.stage === "auth" ? "MAIB_AUTH_FAILED" : "MAIB_CHECKOUT_FAILED",
      claim.attemptId,
    );
  }
}

function normalizeFailureCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 100) || "UNKNOWN";
}

function result(
  outcome: Exclude<PaymentInitiationResult["outcome"], "SUCCESS">,
  paymentAttemptId: string | null = null,
): PaymentInitiationResult {
  return {
    outcome,
    paymentAttemptId,
    checkoutUrl: null,
    reused: false,
    returnAccessToken: null,
  };
}
