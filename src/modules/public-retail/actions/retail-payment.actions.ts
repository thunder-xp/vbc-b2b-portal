"use server";

import { cookies } from "next/headers";

import { canInitiateRetailPaymentForAccess, getRetailCheckoutAccess } from "../retail-checkout-server";
import { hashRetailOrderAccessToken } from "../retail-order-token";
import { paymentReturnCookieMaxAgeSeconds, paymentReturnCookieName } from "@/src/modules/payments/payment-return-access";
import { createMaibReviewPaymentService, createRetailPaymentService, maibConfigurationSummary, maibReviewConfigurationSummary } from "@/src/modules/payments/server";
import type { PaymentInitiationOutcome } from "@/src/modules/payments";

export type RetailPaymentActionResult = Readonly<{
  outcome: PaymentInitiationOutcome;
  paymentAttemptId: string | null;
  checkoutUrl: string | null;
}>;

export async function initiateRetailPaymentAction(input: Readonly<{ orderToken: string; idempotencyKey: string }>): Promise<RetailPaymentActionResult> {
  const checkoutAccess = await getRetailCheckoutAccess();
  const reviewMode = checkoutAccess.source === "maib_review";
  const paymentConfiguration = reviewMode ? maibReviewConfigurationSummary() : maibConfigurationSummary();
  if (!canInitiateRetailPaymentForAccess(checkoutAccess, paymentConfiguration)) return failure("NOT_ELIGIBLE");
  const accessTokenHash = hashRetailOrderAccessToken(input.orderToken);
  if (!accessTokenHash) return failure("NOT_ELIGIBLE");
  try {
    const paymentService = reviewMode ? createMaibReviewPaymentService() : createRetailPaymentService();
    const result = await paymentService.initiate({
      accessTokenHash,
      checkoutChannel: reviewMode ? "maib_review" : "public",
      idempotencyKey: input.idempotencyKey,
    });
    const cookieName = result.paymentAttemptId ? paymentReturnCookieName(result.paymentAttemptId) : null;
    if (result.outcome === "SUCCESS" && cookieName && result.returnAccessToken) {
      (await cookies()).set(cookieName, result.returnAccessToken, {
        httpOnly: true,
        maxAge: paymentReturnCookieMaxAgeSeconds,
        path: "/payment/return",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return { outcome: result.outcome, paymentAttemptId: result.paymentAttemptId, checkoutUrl: result.checkoutUrl };
  } catch {
    return failure("CONFIGURATION_ERROR");
  }
}

function failure(outcome: Exclude<PaymentInitiationOutcome, "SUCCESS">): RetailPaymentActionResult {
  return { outcome, paymentAttemptId: null, checkoutUrl: null };
}
