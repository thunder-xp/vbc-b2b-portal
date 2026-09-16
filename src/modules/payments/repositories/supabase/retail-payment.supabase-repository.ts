import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { PaymentAttemptStatus, PaymentClaim, PaymentClaimOutcome, PaymentConfirmationOutcome, PaymentConfirmationResult, PaymentRefundClaim, PaymentRefundClaimOutcome, PaymentRefundResult, PaymentRefundStatus, PaymentReturnState } from "../../types";
import type { MaibReconciliationContext } from "../retail-payment.repository";
import type { RetailPaymentRepository } from "../retail-payment.repository";

const OUTCOMES = new Set<PaymentClaimOutcome>(["NOT_ELIGIBLE", "INVALID_ORDER_STATE", "UNPRICED_ORDER", "PAYMENT_ATTEMPT_EXISTS", "CLAIMED", "REUSE_PENDING"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RetailPaymentRepositoryError extends Error {
  constructor(readonly code: string | null) {
    super("Retail payment persistence failed.");
    this.name = "RetailPaymentRepositoryError";
  }
}

export class SupabaseRetailPaymentRepository implements RetailPaymentRepository {
  private async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await createAdminClient().rpc(name, args);
    if (error) throw new RetailPaymentRepositoryError(error.code);
    return data;
  }

  async claim(input: Parameters<RetailPaymentRepository["claim"]>[0]) {
    return parseClaim(await this.rpc("claim_retail_payment_attempt", {
      p_access_token_hash: input.accessTokenHash,
      p_provider: input.provider,
      p_idempotency_key: input.idempotencyKey,
    }));
  }

  async completeCheckout(input: Parameters<RetailPaymentRepository["completeCheckout"]>[0]) {
    return await this.rpc("complete_retail_payment_attempt_checkout", {
      p_attempt_id: input.attemptId,
      p_idempotency_key: input.idempotencyKey,
      p_provider_checkout_id: input.checkoutId,
      p_provider_checkout_url: input.checkoutUrl,
      p_provider_status: input.providerStatus,
    }) === true;
  }

  async recordFailure(input: Parameters<RetailPaymentRepository["recordFailure"]>[0]) {
    return await this.rpc("record_retail_payment_attempt_failure", {
      p_attempt_id: input.attemptId,
      p_idempotency_key: input.idempotencyKey,
      p_failure_code: input.failureCode,
      p_terminal: input.terminal,
    }) === true;
  }

  async confirmMaib(input: Parameters<RetailPaymentRepository["confirmMaib"]>[0]) {
    return parseConfirmation(await this.rpc("confirm_maib_retail_payment_callback_v1", {
      p_provider_checkout_id: input.evidence.checkoutId,
      p_provider_payment_id: input.evidence.paymentId,
      p_order_reference: input.evidence.orderReference,
      p_checkout_amount: input.evidence.checkoutAmount,
      p_checkout_currency: input.evidence.checkoutCurrency,
      p_payment_amount: input.evidence.paymentAmount,
      p_payment_currency: input.evidence.paymentCurrency,
      p_provider_status: input.evidence.paymentStatus,
      p_provider_event_at: input.evidence.providerEventAt,
      p_provider_rrn: input.evidence.rrn,
      p_source: input.source,
    }));
  }

  async getMaibReconciliationContext(attemptId: string) {
    return parseReconciliationContext(await this.rpc("get_maib_retail_payment_reconciliation_context_v1", { p_attempt_id: attemptId }));
  }

  async retryMaibActivation(attemptId: string) {
    return parseConfirmation(await this.rpc("retry_maib_retail_payment_activation_v1", { p_attempt_id: attemptId }));
  }

  async getReturnState(paymentAttemptId: string) {
    return parseReturnState(await this.rpc("get_retail_payment_return_state_v1", { p_payment_attempt_id: paymentAttemptId }));
  }

  async claimRefund(input: Parameters<RetailPaymentRepository["claimRefund"]>[0]) {
    return parseRefundClaim(await this.rpc("claim_retail_payment_refund_v1", {
      p_payment_attempt_id: input.paymentAttemptId,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    }));
  }

  async startRefundRequest(refundId: string) {
    return await this.rpc("start_retail_payment_refund_request_v1", { p_refund_id: refundId }) === true;
  }

  async assignProviderRefund(input: Parameters<RetailPaymentRepository["assignProviderRefund"]>[0]) {
    return await this.rpc("assign_retail_payment_provider_refund_v1", {
      p_refund_id: input.refundId,
      p_provider_refund_id: input.providerRefundId,
      p_provider_status: input.providerStatus,
    }) === true;
  }

  async recordRefundFailure(input: Parameters<RetailPaymentRepository["recordRefundFailure"]>[0]) {
    return await this.rpc("record_retail_payment_refund_failure_v1", {
      p_refund_id: input.refundId,
      p_failure_code: input.failureCode,
      p_terminal: input.terminal,
    }) === true;
  }

  async getRefundContext(refundId: string) {
    const value = await this.rpc("get_retail_payment_refund_context_v1", { p_refund_id: refundId });
    return value === null ? null : parseRefundClaim({ ...(value as Record<string, unknown>), outcome: "REUSE" });
  }

  async reconcileRefund(input: Parameters<RetailPaymentRepository["reconcileRefund"]>[0]) {
    return parseRefundResult(await this.rpc("reconcile_retail_payment_refund_v1", {
      p_refund_id: input.refundId,
      p_provider_payment_id: input.refund.paymentId,
      p_provider_refund_id: input.refund.refundId,
      p_refund_type: input.refund.refundType,
      p_amount: input.refund.amount,
      p_currency: input.refund.currency,
      p_provider_status: input.refund.status,
      p_provider_executed_at: input.refund.executedAt,
      p_payment_status: input.payment.status,
      p_remaining_refundable: input.payment.refundableAmount,
    }));
  }
}

function parseClaim(value: unknown): PaymentClaim {
  if (!value || typeof value !== "object") throw new RetailPaymentRepositoryError("invalid_response");
  const row = value as Record<string, unknown>;
  if (typeof row.outcome !== "string" || !OUTCOMES.has(row.outcome as PaymentClaimOutcome)) throw new RetailPaymentRepositoryError("invalid_response");
  const outcome = row.outcome as PaymentClaimOutcome;
  if (outcome === "CLAIMED" || outcome === "REUSE_PENDING") {
    if (!isUuid(row.attemptId) || !isMoney(row.amount) || row.currency !== "MDL" || typeof row.orderNumber !== "string" || !isIsoDate(row.orderCreatedAt) || (row.locale !== "ru" && row.locale !== "ro")) {
      throw new RetailPaymentRepositoryError("invalid_response");
    }
    if (outcome === "REUSE_PENDING" && !isSafeHttps(row.checkoutUrl)) throw new RetailPaymentRepositoryError("invalid_response");
  }
  return {
    outcome,
    attemptId: isUuid(row.attemptId) ? row.attemptId : null,
    amount: isMoney(row.amount) ? String(row.amount) : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    orderNumber: typeof row.orderNumber === "string" ? row.orderNumber : null,
    orderCreatedAt: isIsoDate(row.orderCreatedAt) ? row.orderCreatedAt : null,
    locale: row.locale === "ru" || row.locale === "ro" ? row.locale : null,
    checkoutUrl: typeof row.checkoutUrl === "string" ? row.checkoutUrl : null,
  };
}

function isUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function isMoney(value: unknown) { return (typeof value === "string" || typeof value === "number") && /^\d+(?:\.\d{1,2})?$/.test(String(value)); }
function isIsoDate(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function isSafeHttps(value: unknown): value is string { try { const url = new URL(String(value)); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } }

const CONFIRMATION_OUTCOMES = new Set<PaymentConfirmationOutcome>([
  "PAID", "DUPLICATE", "PAID_PENDING_ACTIVATION", "NON_PAID", "UNKNOWN_CHECKOUT", "PAYMENT_MISMATCH",
  "ORDER_MISMATCH", "AMOUNT_MISMATCH", "CURRENCY_MISMATCH", "INVALID_EVIDENCE",
]);
const ATTEMPT_STATUSES = new Set<PaymentAttemptStatus>(["created", "pending", "paid_pending_activation", "paid", "failed", "cancelled", "expired"]);

function parseConfirmation(value: unknown): PaymentConfirmationResult {
  if (!value || typeof value !== "object") throw new RetailPaymentRepositoryError("invalid_response");
  const row = value as Record<string, unknown>;
  if (typeof row.outcome !== "string" || !CONFIRMATION_OUTCOMES.has(row.outcome as PaymentConfirmationOutcome)) throw new RetailPaymentRepositoryError("invalid_response");
  return {
    outcome: row.outcome as PaymentConfirmationOutcome,
    attemptId: isUuid(row.attemptId) ? row.attemptId : null,
    retailOrderId: isUuid(row.retailOrderId) ? row.retailOrderId : null,
    paymentStatus: typeof row.paymentStatus === "string" && ATTEMPT_STATUSES.has(row.paymentStatus as PaymentAttemptStatus) ? row.paymentStatus as PaymentAttemptStatus : null,
    activationRepeated: typeof row.activationRepeated === "boolean" ? row.activationRepeated : null,
    installationRequirementId: isUuid(row.installationRequirementId) ? row.installationRequirementId : null,
  };
}

function parseReconciliationContext(value: unknown): MaibReconciliationContext | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new RetailPaymentRepositoryError("invalid_response");
  const row = value as Record<string, unknown>;
  if (!isUuid(row.attemptId) || !isUuid(row.checkoutId) || !isMoney(row.amount) || typeof row.currency !== "string" || typeof row.status !== "string") throw new RetailPaymentRepositoryError("invalid_response");
  return { attemptId: row.attemptId, checkoutId: row.checkoutId, paymentId: isUuid(row.paymentId) ? row.paymentId : null, status: row.status, amount: String(row.amount), currency: row.currency };
}

function parseReturnState(value: unknown): PaymentReturnState | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new RetailPaymentRepositoryError("invalid_response");
  const row = value as Record<string, unknown>;
  if ((row.status !== "PROCESSING" && row.status !== "PAID" && row.status !== "FAILED" && row.status !== "CANCELLED") || (row.locale !== "ru" && row.locale !== "ro")) throw new RetailPaymentRepositoryError("invalid_response");
  return { status: row.status, locale: row.locale };
}

const REFUND_CLAIM_OUTCOMES = new Set<PaymentRefundClaimOutcome>([
  "INVALID_INPUT", "NOT_FOUND", "NOT_REFUNDABLE", "MISSING_PROVIDER_PAYMENT_ID",
  "IDEMPOTENCY_CONFLICT", "ALREADY_REFUNDED", "CLAIMED", "REUSE",
]);
const REFUND_STATUSES = new Set<PaymentRefundStatus>(["created", "pending", "refunded", "failed"]);

function parseRefundClaim(value: unknown): PaymentRefundClaim {
  if (!value || typeof value !== "object") throw new RetailPaymentRepositoryError("invalid_response");
  const row = value as Record<string, unknown>;
  if (typeof row.outcome !== "string" || !REFUND_CLAIM_OUTCOMES.has(row.outcome as PaymentRefundClaimOutcome)) throw new RetailPaymentRepositoryError("invalid_response");
  const detailed = row.outcome === "CLAIMED" || row.outcome === "REUSE";
  if (detailed && (!isUuid(row.refundId) || !isUuid(row.paymentAttemptId) || !isUuid(row.providerPaymentId)
    || !isMoney(row.amount) || row.currency !== "MDL" || typeof row.reason !== "string"
    || typeof row.status !== "string" || !REFUND_STATUSES.has(row.status as PaymentRefundStatus))) {
    throw new RetailPaymentRepositoryError("invalid_response");
  }
  return {
    outcome: row.outcome as PaymentRefundClaimOutcome,
    refundId: isUuid(row.refundId) ? row.refundId : null,
    paymentAttemptId: isUuid(row.paymentAttemptId) ? row.paymentAttemptId : null,
    providerPaymentId: isUuid(row.providerPaymentId) ? row.providerPaymentId : null,
    providerRefundId: isUuid(row.providerRefundId) ? row.providerRefundId : null,
    amount: isMoney(row.amount) ? Number(row.amount).toFixed(2) : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    reason: typeof row.reason === "string" ? row.reason : null,
    status: typeof row.status === "string" && REFUND_STATUSES.has(row.status as PaymentRefundStatus) ? row.status as PaymentRefundStatus : null,
    providerStatus: typeof row.providerStatus === "string" ? row.providerStatus : null,
    providerRequestStarted: row.providerRequestStarted === true,
    failureCode: typeof row.failureCode === "string" ? row.failureCode : null,
  };
}

function parseRefundResult(value: unknown): PaymentRefundResult {
  if (!value || typeof value !== "object") throw new RetailPaymentRepositoryError("invalid_response");
  const row = value as Record<string, unknown>;
  const allowed = new Set(["REFUNDED", "PENDING", "FAILED", "EVIDENCE_MISMATCH", "DUPLICATE", "NOT_FOUND"]);
  if (typeof row.outcome !== "string" || !allowed.has(row.outcome)) throw new RetailPaymentRepositoryError("invalid_response");
  return {
    outcome: row.outcome as PaymentRefundResult["outcome"],
    refundId: isUuid(row.refundId) ? row.refundId : null,
    providerRefundId: null,
    status: typeof row.status === "string" && REFUND_STATUSES.has(row.status as PaymentRefundStatus) ? row.status as PaymentRefundStatus : null,
    providerStatus: null,
    amount: null,
    currency: null,
    remainingRefundable: row.remainingRefundable !== null && row.remainingRefundable !== undefined && isMoney(row.remainingRefundable) ? Number(row.remainingRefundable).toFixed(2) : null,
    confirmedAt: isIsoDate(row.confirmedAt) ? row.confirmedAt : null,
    reused: row.outcome === "DUPLICATE",
  };
}
