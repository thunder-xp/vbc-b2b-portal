"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { requireAdminPermission } from "@/src/modules/admin/services";

import { createRetailPaymentService, maibConfigurationSummary, verifyMaibConnectivity } from "./server";
import { paymentReturnCookieMaxAgeSeconds, paymentReturnCookieName } from "./payment-return-access";
import type { PaymentRefundResult } from "./types";

export type MaibConnectivityActionState = Readonly<{
  status: "IDLE" | "PASS" | "FAIL";
  mode: string;
  apiOrigin: string | null;
  clientIdFingerprint: string | null;
  authLatencyMs: number | null;
  safeError: string | null;
}>;

export async function verifyMaibConnectivityAdminAction(_previous: MaibConnectivityActionState): Promise<MaibConnectivityActionState> {
  void _previous;
  await requireAdminPermission("admin.finance.view");
  const configuration = maibConfigurationSummary();
  if (!configuration.ready) {
    return {
      status: "FAIL",
      mode: configuration.mode,
      apiOrigin: configuration.apiOrigin,
      clientIdFingerprint: configuration.clientIdFingerprint,
      authLatencyMs: null,
      safeError: configuration.mode === "DISABLED" ? "MAIB_PAYMENT_DISABLED" : "MAIB_CONFIGURATION_INVALID",
    };
  }
  try {
    const result = await verifyMaibConnectivity();
    return { ...result, safeError: null };
  } catch (error) {
    const safeError = error && typeof error === "object" && "safeCode" in error && typeof error.safeCode === "string"
      ? error.safeCode
      : "MAIB_CONNECTIVITY_FAILED";
    return {
      status: "FAIL",
      mode: configuration.mode,
      apiOrigin: configuration.apiOrigin,
      clientIdFingerprint: configuration.clientIdFingerprint,
      authLatencyMs: null,
      safeError,
    };
  }
}

export type ControlledLivePaymentActionState = Readonly<{
  status: "IDLE" | "READY" | "FAIL";
  outcome: string | null;
  paymentAttemptId: string | null;
  checkoutUrl: string | null;
}>;

export async function initiateControlledLivePaymentAdminAction(
  _previous: ControlledLivePaymentActionState,
  formData: FormData,
): Promise<ControlledLivePaymentActionState> {
  void _previous;
  await requireAdminPermission("admin.payments.refund");
  const configuration = maibConfigurationSummary();
  if (process.env.RETAIL_CHECKOUT_ENABLED === "true" || !configuration.ready || !configuration.production
    || configuration.apiOrigin !== "https://api.maibmerchants.md"
    || configuration.callbackUrl !== "https://www.nsd.md/api/payments/maib/callback") {
    return { status: "FAIL", outcome: "CONFIGURATION_ERROR", paymentAttemptId: null, checkoutUrl: null };
  }
  const orderNumber = String(formData.get("orderNumber") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  const result = await createRetailPaymentService().initiateControlledRetailPayment({ orderNumber, idempotencyKey });
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
  return {
    status: result.outcome === "SUCCESS" ? "READY" : "FAIL",
    outcome: result.outcome,
    paymentAttemptId: result.paymentAttemptId,
    checkoutUrl: result.checkoutUrl,
  };
}

export async function refundRetailPaymentAdminAction(input: Readonly<{
  paymentAttemptId: string;
  reason: string;
  idempotencyKey?: string;
}>): Promise<PaymentRefundResult> {
  await requireAdminPermission("admin.payments.refund");
  return createRetailPaymentService().refundRetailPayment({
    paymentAttemptId: input.paymentAttemptId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
  });
}

export async function reconcileRetailPaymentRefundAdminAction(refundId: string): Promise<PaymentRefundResult> {
  await requireAdminPermission("admin.payments.refund");
  return createRetailPaymentService().reconcileRetailPaymentRefund(refundId);
}
