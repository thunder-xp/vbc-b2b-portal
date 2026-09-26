import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { PaymentProvider } from "../providers/payment-provider";
import { PaymentProviderError } from "../providers/payment-provider";
import type { RetailPaymentRepository } from "../repositories/retail-payment.repository";
import type { MaibPaymentEvidence, PaymentConfirmationResult, PaymentInitiationResult, PaymentReconciliationBatchResult, PaymentReconciliationResult, PaymentRefundClaim, PaymentRefundResult, PaymentReturnState } from "../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_HASH = /^[0-9a-f]{64}$/;

export class RetailPaymentService {
  constructor(
    private readonly repository: RetailPaymentRepository,
    private readonly provider: PaymentProvider,
  ) {}

  async initiate(input: Readonly<{ accessTokenHash: string; checkoutChannel: "public" | "maib_review"; idempotencyKey: string }>): Promise<PaymentInitiationResult> {
    if (!TOKEN_HASH.test(input.accessTokenHash) || !UUID.test(input.idempotencyKey)) return result("NOT_ELIGIBLE");
    const returnAccessToken = randomBytes(32).toString("hex");
    const returnAccessTokenHash = createHash("sha256").update(returnAccessToken).digest("hex");
    let claim;
    try { claim = await this.repository.claim({ ...input, provider: this.provider.provider, returnAccessTokenHash }); }
    catch { return result("PERSISTENCE_FAILED"); }

    if (claim.outcome === "REUSE_PENDING") return { outcome: "SUCCESS", paymentAttemptId: claim.attemptId, checkoutUrl: claim.checkoutUrl, reused: true, returnAccessToken };
    if (claim.outcome !== "CLAIMED") return result(claim.outcome);
    if (!claim.attemptId || !claim.amount || claim.currency !== "MDL" || !claim.orderNumber || !claim.orderCreatedAt || !claim.locale) return result("PERSISTENCE_FAILED", claim.attemptId);

    try {
      const checkout = await this.provider.createCheckout({
        paymentAttemptId: claim.attemptId,
        orderNumber: claim.orderNumber,
        orderCreatedAt: claim.orderCreatedAt,
        amount: claim.amount,
        currency: "MDL",
        locale: claim.locale,
      });
      const persisted = await this.repository.completeCheckout({
        attemptId: claim.attemptId,
        idempotencyKey: input.idempotencyKey,
        checkoutId: checkout.checkoutId,
        checkoutUrl: checkout.checkoutUrl,
        providerStatus: checkout.providerStatus,
      });
      if (!persisted) return result("PERSISTENCE_FAILED", claim.attemptId);
      return { outcome: "SUCCESS", paymentAttemptId: claim.attemptId, checkoutUrl: checkout.checkoutUrl, reused: false, returnAccessToken };
    } catch (error) {
      if (!(error instanceof PaymentProviderError)) return this.recordFailure(claim.attemptId, input.idempotencyKey, "UNEXPECTED_PROVIDER_ERROR", false, "MAIB_CHECKOUT_FAILED");
      if (error.stage === "configuration") return this.recordFailure(claim.attemptId, input.idempotencyKey, error.safeCode, true, "CONFIGURATION_ERROR");
      return this.recordFailure(
        claim.attemptId,
        input.idempotencyKey,
        `${error.stage.toUpperCase()}:${error.safeCode}`,
        !error.ambiguous,
        error.stage === "auth" ? "MAIB_AUTH_FAILED" : "MAIB_CHECKOUT_FAILED",
      );
    }
  }

  async confirmMaibCallback(evidence: MaibPaymentEvidence, checkoutChannel: "public" | "maib_review" = "public"): Promise<PaymentConfirmationResult> {
    return this.withPaidConfirmation(await this.repository.confirmMaib({ evidence, source: "callback", checkoutChannel }));
  }

  async reconcileMaibPayment(paymentAttemptId: string, leaseToken: string | null = null): Promise<PaymentReconciliationResult> {
    if (!UUID.test(paymentAttemptId)) return confirmation("INVALID_EVIDENCE");
    const context = await this.repository.getMaibReconciliationContext(paymentAttemptId);
    if (!context) return confirmation("INVALID_EVIDENCE");
    if (context.status === "paid") return this.withPaidConfirmation({ ...confirmation("DUPLICATE"), attemptId: context.attemptId, paymentStatus: "paid", activationRepeated: true });
    if (context.status === "paid_pending_activation") {
      const result = await this.withPaidConfirmation(await this.repository.retryMaibActivation(context.attemptId));
      if (leaseToken && result.outcome === "PAID_PENDING_ACTIVATION") {
        await this.repository.recordMaibReconciliationRetry({ attemptId: context.attemptId, leaseToken, errorCode: "ACTIVATION_PENDING" });
      }
      return result;
    }
    const checkout = await this.provider.getCheckoutState(context.checkoutId);
    if (checkout.kind === "payment") {
      const result = await this.withPaidConfirmation(await this.repository.confirmMaib({ evidence: checkout.evidence, source: "reconciliation", checkoutChannel: "public" }));
      if (leaseToken && result.outcome !== "PAID" && result.outcome !== "DUPLICATE") {
        await this.repository.recordMaibReconciliationRetry({ attemptId: context.attemptId, leaseToken, errorCode: `EVIDENCE_${result.outcome}` });
      }
      return result;
    }
    return this.repository.recordMaibCheckoutState({ attemptId: context.attemptId, leaseToken, state: checkout });
  }

  async reconcileDueMaibPayments(limit = 3): Promise<PaymentReconciliationBatchResult> {
    const leaseToken = randomUUID();
    const attemptIds = await this.repository.claimMaibReconciliationBatch(Math.min(Math.max(Math.trunc(limit), 1), 5), leaseToken);
    const result = { claimed: attemptIds.length, paid: 0, pending: 0, terminal: 0, retried: 0 };
    for (const attemptId of attemptIds) {
      try {
        const reconciliation = await this.reconcileMaibPayment(attemptId, leaseToken);
        if (reconciliation.outcome === "PAID" || reconciliation.outcome === "DUPLICATE") result.paid += 1;
        else if (reconciliation.outcome === "PENDING") result.pending += 1;
        else if (reconciliation.outcome === "EXPIRED" || reconciliation.outcome === "CANCELLED" || reconciliation.outcome === "FAILED") result.terminal += 1;
        else result.retried += 1;
      } catch (error) {
        const safeCode = error instanceof PaymentProviderError
          ? `${error.stage.toUpperCase()}:${error.safeCode}`
          : "UNEXPECTED_RECONCILIATION_ERROR";
        await this.repository.recordMaibReconciliationRetry({ attemptId, leaseToken, errorCode: normalizeFailureCode(safeCode) });
        result.retried += 1;
      }
    }
    return result;
  }

  async getReturnState(paymentAttemptId: string, returnAccessToken: string): Promise<PaymentReturnState | null> {
    if (!UUID.test(paymentAttemptId) || !TOKEN_HASH.test(returnAccessToken)) return null;
    const returnAccessTokenHash = createHash("sha256").update(returnAccessToken).digest("hex");
    return this.repository.getReturnState(paymentAttemptId, returnAccessTokenHash);
  }

  async listOrderPaymentStates(retailOrderIds: string[]) {
    const ids = [...new Set(retailOrderIds.filter((id) => UUID.test(id)))];
    return ids.length ? this.repository.listOrderPaymentStates(ids) : [];
  }

  async listRecentPaymentStates(limit = 50) {
    return this.repository.listRecentPaymentStates(Math.min(Math.max(Math.trunc(limit), 1), 100));
  }

  async getOrderPaymentStateByNumber(orderNumber: string) {
    return /^R-[0-9]{4}-[0-9]{6}$/.test(orderNumber)
      ? this.repository.getOrderPaymentStateByNumber(orderNumber)
      : null;
  }

  async getControlledPaymentOrder(orderNumber: string) {
    return /^R-[0-9]{4}-[0-9]{6}$/.test(orderNumber)
      ? this.repository.getControlledPaymentOrder(orderNumber)
      : null;
  }

  async initiateControlledRetailPayment(input: Readonly<{ orderNumber: string; idempotencyKey: string }>) {
    const order = await this.getControlledPaymentOrder(input.orderNumber);
    if (!order) return result("NOT_ELIGIBLE");
    return this.initiate({ accessTokenHash: order.accessTokenHash, checkoutChannel: "public", idempotencyKey: input.idempotencyKey });
  }

  async refundRetailPayment(input: Readonly<{ paymentAttemptId: string; reason: string; idempotencyKey: string }>): Promise<PaymentRefundResult> {
    const reason = input.reason.trim();
    if (!UUID.test(input.paymentAttemptId) || !UUID.test(input.idempotencyKey) || reason.length < 1 || reason.length > 500) {
      return refundResult("INVALID_INPUT");
    }

    let claim: PaymentRefundClaim;
    try { claim = await this.repository.claimRefund({ ...input, reason }); }
    catch { return refundResult("PERSISTENCE_FAILED"); }
    if (claim.outcome !== "CLAIMED" && claim.outcome !== "REUSE") return refundResult(claim.outcome);
    if (!claim.refundId || !claim.providerPaymentId || !claim.amount || claim.currency !== "MDL" || !claim.reason || !claim.status) {
      return refundResult("PERSISTENCE_FAILED", claim);
    }
    if (claim.status === "refunded") return refundResult("REFUNDED", claim, { remainingRefundable: "0.00", reused: true });
    if (claim.providerRefundId) return this.reconcileRetailPaymentRefund(claim.refundId, true);
    if (claim.providerRequestStarted) return refundResult("AMBIGUOUS_PROVIDER_RESULT", claim, { reused: true });

    try {
      if (!await this.repository.startRefundRequest(claim.refundId)) return refundResult("PERSISTENCE_FAILED", claim);
    } catch { return refundResult("PERSISTENCE_FAILED", claim); }

    try {
      const providerRefund = await this.provider.createRefund({
        paymentId: claim.providerPaymentId,
        amount: claim.amount,
        currency: "MDL",
        reason: claim.reason,
      });
      const persisted = await this.repository.assignProviderRefund({
        refundId: claim.refundId,
        providerRefundId: providerRefund.refundId,
        providerStatus: providerRefund.providerStatus,
      });
      if (!persisted) return refundResult("PERSISTENCE_FAILED", claim);
      return this.reconcileRetailPaymentRefund(claim.refundId, claim.outcome === "REUSE");
    } catch (error) {
      const providerError = error instanceof PaymentProviderError ? error : null;
      const ambiguous = providerError?.ambiguous ?? true;
      const failureCode = normalizeFailureCode(providerError ? `${providerError.stage}:${providerError.safeCode}` : "UNEXPECTED_PROVIDER_ERROR");
      try { await this.repository.recordRefundFailure({ refundId: claim.refundId, failureCode, terminal: !ambiguous }); }
      catch { return refundResult("PERSISTENCE_FAILED", claim); }
      return refundResult(ambiguous ? "AMBIGUOUS_PROVIDER_RESULT" : "PROVIDER_FAILED", claim, { status: ambiguous ? "pending" : "failed" });
    }
  }

  async reconcileRetailPaymentRefund(refundId: string, reused = true): Promise<PaymentRefundResult> {
    if (!UUID.test(refundId)) return refundResult("INVALID_INPUT");
    let context;
    try { context = await this.repository.getRefundContext(refundId); }
    catch { return refundResult("PERSISTENCE_FAILED"); }
    if (!context || !context.providerRefundId || !context.providerPaymentId || !context.amount || context.currency !== "MDL") {
      return context?.providerRequestStarted
        ? refundResult("AMBIGUOUS_PROVIDER_RESULT", context ?? undefined, { reused })
        : refundResult("INVALID_INPUT", context ?? undefined, { reused });
    }
    if (context.status === "refunded") return refundResult("REFUNDED", context, { remainingRefundable: "0.00", reused: true });
    try {
      const refund = await this.provider.getRefundEvidence(context.providerRefundId);
      const payment = await this.provider.getPaymentRefundState(context.providerPaymentId);
      const result = await this.repository.reconcileRefund({ refundId, refund, payment });
      return {
        ...result,
        providerRefundId: context.providerRefundId,
        providerStatus: refund.status,
        amount: context.amount,
        currency: context.currency,
        reused,
      };
    } catch (error) {
      const providerError = error instanceof PaymentProviderError ? error : null;
      const failureCode = normalizeFailureCode(providerError ? `${providerError.stage}:${providerError.safeCode}` : "UNEXPECTED_RECONCILIATION_ERROR");
      try { await this.repository.recordRefundFailure({ refundId, failureCode, terminal: false }); }
      catch { return refundResult("PERSISTENCE_FAILED", context, { reused }); }
      return refundResult("PENDING", context, { reused });
    }
  }

  private async recordFailure(attemptId: string, idempotencyKey: string, failureCode: string, terminal: boolean, outcome: "CONFIGURATION_ERROR" | "MAIB_AUTH_FAILED" | "MAIB_CHECKOUT_FAILED") {
    try {
      const persisted = await this.repository.recordFailure({ attemptId, idempotencyKey, failureCode: normalizeFailureCode(failureCode), terminal });
      return persisted ? result(outcome, attemptId) : result("PERSISTENCE_FAILED", attemptId);
    } catch { return result("PERSISTENCE_FAILED", attemptId); }
  }

  private async withPaidConfirmation(result: PaymentConfirmationResult): Promise<PaymentConfirmationResult> {
    if ((result.outcome === "PAID" || result.outcome === "DUPLICATE") && result.attemptId) {
      try { await this.repository.persistPaidConfirmationEmail(result.attemptId); }
      catch (error) { console.error({ event: "retail_payment_confirmation_email_queue_failed", errorName: error instanceof Error ? error.name : typeof error }); }
    }
    return result;
  }
}

function normalizeFailureCode(value: string) { return value.toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 100) || "UNKNOWN"; }
function result(outcome: Exclude<PaymentInitiationResult["outcome"], "SUCCESS">, paymentAttemptId: string | null = null): PaymentInitiationResult { return { outcome, paymentAttemptId, checkoutUrl: null, reused: false, returnAccessToken: null }; }
function confirmation(outcome: PaymentConfirmationResult["outcome"]): PaymentConfirmationResult {
  return { outcome, attemptId: null, retailOrderId: null, paymentStatus: null, activationRepeated: null, installationRequirementId: null };
}

function refundResult(
  outcome: PaymentRefundResult["outcome"],
  claim?: PaymentRefundClaim,
  override: Partial<PaymentRefundResult> = {},
): PaymentRefundResult {
  return {
    outcome,
    refundId: claim?.refundId ?? null,
    providerRefundId: claim?.providerRefundId ?? null,
    status: claim?.status ?? null,
    providerStatus: claim?.providerStatus ?? null,
    amount: claim?.amount ?? null,
    currency: claim?.currency ?? null,
    remainingRefundable: null,
    confirmedAt: null,
    reused: false,
    ...override,
  };
}
