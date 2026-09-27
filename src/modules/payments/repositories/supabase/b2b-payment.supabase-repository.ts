import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type {
  PaymentAttemptStatus,
  PaymentClaim,
  PaymentClaimOutcome,
  PaymentConfirmationOutcome,
  PaymentConfirmationResult,
  PaymentReturnState,
} from "../../types";
import type { B2bPaymentRepository } from "../b2b-payment.repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES = new Set<PaymentClaimOutcome>([
  "NOT_ELIGIBLE", "INVALID_ORDER_STATE", "UNPRICED_ORDER",
  "PAYMENT_ATTEMPT_EXISTS", "CLAIMED", "REUSE_PENDING",
]);
const CONFIRMATION_OUTCOMES = new Set<PaymentConfirmationOutcome>([
  "PAID", "DUPLICATE", "NON_PAID", "UNKNOWN_CHECKOUT",
  "PAYMENT_MISMATCH", "ORDER_MISMATCH", "AMOUNT_MISMATCH",
  "CURRENCY_MISMATCH", "INVALID_EVIDENCE",
]);
const ATTEMPT_STATUSES = new Set<PaymentAttemptStatus>([
  "created", "pending", "paid", "failed", "cancelled", "expired",
]);

export class B2bPaymentRepositoryError extends Error {
  constructor(readonly code: string | null) {
    super("B2B payment persistence failed.");
    this.name = "B2bPaymentRepositoryError";
  }
}

export class SupabaseB2bPaymentRepository implements B2bPaymentRepository {
  async claim(input: Parameters<B2bPaymentRepository["claim"]>[0]) {
    const { data, error } = await (await createClient()).rpc(
      "claim_b2b_payment_attempt_v1",
      {
        p_partner_order_id: input.partnerOrderId,
        p_provider: input.provider,
        p_idempotency_key: input.idempotencyKey,
        p_return_access_token_hash: input.returnAccessTokenHash,
        p_locale: input.locale,
      },
    );
    if (error) throw new B2bPaymentRepositoryError(error.code);
    return parseClaim(data);
  }

  async completeCheckout(input: Parameters<B2bPaymentRepository["completeCheckout"]>[0]) {
    const { data, error } = await createAdminClient().rpc(
      "complete_b2b_payment_attempt_checkout_v1",
      {
        p_attempt_id: input.attemptId,
        p_idempotency_key: input.idempotencyKey,
        p_provider_checkout_id: input.checkoutId,
        p_provider_checkout_url: input.checkoutUrl,
        p_provider_status: input.providerStatus,
      },
    );
    if (error) throw new B2bPaymentRepositoryError(error.code);
    return data === true;
  }

  async recordFailure(input: Parameters<B2bPaymentRepository["recordFailure"]>[0]) {
    const { data, error } = await createAdminClient().rpc(
      "record_b2b_payment_attempt_failure_v1",
      {
        p_attempt_id: input.attemptId,
        p_idempotency_key: input.idempotencyKey,
        p_failure_code: input.failureCode,
        p_terminal: input.terminal,
      },
    );
    if (error) throw new B2bPaymentRepositoryError(error.code);
    return data === true;
  }

  async confirmMaib(evidence: Parameters<B2bPaymentRepository["confirmMaib"]>[0]) {
    const { data, error } = await createAdminClient().rpc(
      "confirm_maib_b2b_payment_callback_v1",
      {
        p_provider_checkout_id: evidence.checkoutId,
        p_provider_payment_id: evidence.paymentId,
        p_order_reference: evidence.orderReference,
        p_checkout_amount: evidence.checkoutAmount,
        p_checkout_currency: evidence.checkoutCurrency,
        p_payment_amount: evidence.paymentAmount,
        p_payment_currency: evidence.paymentCurrency,
        p_provider_status: evidence.paymentStatus,
        p_provider_event_at: evidence.providerEventAt,
        p_provider_rrn: evidence.rrn,
      },
    );
    if (error) throw new B2bPaymentRepositoryError(error.code);
    return parseConfirmation(data);
  }

  async getReturnState(paymentAttemptId: string, returnAccessTokenHash: string) {
    const { data, error } = await createAdminClient().rpc(
      "get_b2b_payment_return_state_v1",
      {
        p_payment_attempt_id: paymentAttemptId,
        p_return_access_token_hash: returnAccessTokenHash,
      },
    );
    if (error) throw new B2bPaymentRepositoryError(error.code);
    return parseReturnState(data);
  }

  async getMaibReconciliationContext(paymentAttemptId: string) {
    const { data, error } = await createAdminClient().rpc(
      "get_maib_b2b_payment_reconciliation_context_v1",
      { p_payment_attempt_id: paymentAttemptId },
    );
    if (error) throw new B2bPaymentRepositoryError(error.code);
    if (data === null) return null;
    const row = object(data);
    if (!isUuid(row.attemptId) || !isUuid(row.checkoutId) || typeof row.status !== "string") {
      throw new B2bPaymentRepositoryError("invalid_response");
    }
    return { attemptId: row.attemptId, checkoutId: row.checkoutId, status: row.status };
  }
}

function parseClaim(value: unknown): PaymentClaim {
  const row = object(value);
  if (typeof row.outcome !== "string" || !OUTCOMES.has(row.outcome as PaymentClaimOutcome)) {
    throw new B2bPaymentRepositoryError("invalid_response");
  }
  const outcome = row.outcome as PaymentClaimOutcome;
  if ((outcome === "CLAIMED" || outcome === "REUSE_PENDING")
    && (!isUuid(row.attemptId) || !isMoney(row.amount) || row.currency !== "MDL"
      || typeof row.orderNumber !== "string" || !isIsoDate(row.orderCreatedAt)
      || (row.locale !== "ru" && row.locale !== "ro"))) {
    throw new B2bPaymentRepositoryError("invalid_response");
  }
  if (outcome === "REUSE_PENDING" && !isSafeHttps(row.checkoutUrl)) {
    throw new B2bPaymentRepositoryError("invalid_response");
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

function parseConfirmation(value: unknown): PaymentConfirmationResult {
  const row = object(value);
  if (typeof row.outcome !== "string"
    || !CONFIRMATION_OUTCOMES.has(row.outcome as PaymentConfirmationOutcome)) {
    throw new B2bPaymentRepositoryError("invalid_response");
  }
  return {
    outcome: row.outcome as PaymentConfirmationOutcome,
    attemptId: isUuid(row.attemptId) ? row.attemptId : null,
    retailOrderId: null,
    paymentStatus: typeof row.paymentStatus === "string"
      && ATTEMPT_STATUSES.has(row.paymentStatus as PaymentAttemptStatus)
      ? row.paymentStatus as PaymentAttemptStatus
      : null,
    activationRepeated: typeof row.activationRepeated === "boolean"
      ? row.activationRepeated
      : null,
    installationRequirementId: null,
  };
}

function parseReturnState(value: unknown): PaymentReturnState | null {
  if (value === null) return null;
  const row = object(value);
  if ((row.status !== "PROCESSING" && row.status !== "PAID"
      && row.status !== "FAILED" && row.status !== "CANCELLED")
    || (row.locale !== "ru" && row.locale !== "ro")
    || typeof row.orderNumber !== "string" || !isMoney(row.amount)
    || typeof row.currency !== "string" || !Array.isArray(row.items)) {
    throw new B2bPaymentRepositoryError("invalid_response");
  }
  const items = row.items.map((item) => {
    const value = object(item);
    if (typeof value.name !== "string" || typeof value.sku !== "string"
      || !Number.isInteger(value.quantity) || Number(value.quantity) < 1) {
      throw new B2bPaymentRepositoryError("invalid_response");
    }
    return { name: value.name, sku: value.sku, quantity: Number(value.quantity) };
  });
  return {
    status: row.status,
    locale: row.locale,
    orderNumber: row.orderNumber,
    amount: Number(row.amount).toFixed(2),
    currency: row.currency,
    confirmedAt: typeof row.confirmedAt === "string" && !Number.isNaN(Date.parse(row.confirmedAt))
      ? row.confirmedAt
      : null,
    items,
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new B2bPaymentRepositoryError("invalid_response");
  }
  return value as Record<string, unknown>;
}
function isUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function isMoney(value: unknown) { return (typeof value === "string" || typeof value === "number") && /^\d+(?:\.\d{1,2})?$/.test(String(value)); }
function isIsoDate(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function isSafeHttps(value: unknown) { try { const url = new URL(String(value)); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } }
