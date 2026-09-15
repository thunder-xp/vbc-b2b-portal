import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { PaymentClaim, PaymentClaimOutcome } from "../../types";
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
