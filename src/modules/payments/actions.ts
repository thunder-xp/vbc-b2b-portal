"use server";

import { randomUUID } from "node:crypto";

import { requireAdminPermission } from "@/src/modules/admin/services";

import { createRetailPaymentService } from "./server";
import type { PaymentRefundResult } from "./types";

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
