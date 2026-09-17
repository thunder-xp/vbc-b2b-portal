"use server";

import { randomUUID } from "node:crypto";

import { requireAdminPermission } from "@/src/modules/admin/services";

import { createRetailPaymentService, maibConfigurationSummary, verifyMaibConnectivity } from "./server";
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
  await requireAdminPermission("admin.payments.refund");
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
