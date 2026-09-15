import type { PaymentProvider } from "../providers/payment-provider";
import { PaymentProviderError } from "../providers/payment-provider";
import type { RetailPaymentRepository } from "../repositories/retail-payment.repository";
import type { PaymentInitiationResult } from "../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_HASH = /^[0-9a-f]{64}$/;

export class RetailPaymentService {
  constructor(
    private readonly repository: RetailPaymentRepository,
    private readonly provider: PaymentProvider,
  ) {}

  async initiate(input: Readonly<{ accessTokenHash: string; idempotencyKey: string }>): Promise<PaymentInitiationResult> {
    if (!TOKEN_HASH.test(input.accessTokenHash) || !UUID.test(input.idempotencyKey)) return result("NOT_ELIGIBLE");
    let claim;
    try { claim = await this.repository.claim({ ...input, provider: this.provider.provider }); }
    catch { return result("PERSISTENCE_FAILED"); }

    if (claim.outcome === "REUSE_PENDING") return { outcome: "SUCCESS", paymentAttemptId: claim.attemptId, checkoutUrl: claim.checkoutUrl, reused: true };
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
      return { outcome: "SUCCESS", paymentAttemptId: claim.attemptId, checkoutUrl: checkout.checkoutUrl, reused: false };
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

  private async recordFailure(attemptId: string, idempotencyKey: string, failureCode: string, terminal: boolean, outcome: "CONFIGURATION_ERROR" | "MAIB_AUTH_FAILED" | "MAIB_CHECKOUT_FAILED") {
    try {
      const persisted = await this.repository.recordFailure({ attemptId, idempotencyKey, failureCode: normalizeFailureCode(failureCode), terminal });
      return persisted ? result(outcome, attemptId) : result("PERSISTENCE_FAILED", attemptId);
    } catch { return result("PERSISTENCE_FAILED", attemptId); }
  }
}

function normalizeFailureCode(value: string) { return value.toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 100) || "UNKNOWN"; }
function result(outcome: Exclude<PaymentInitiationResult["outcome"], "SUCCESS">, paymentAttemptId: string | null = null): PaymentInitiationResult { return { outcome, paymentAttemptId, checkoutUrl: null, reused: false }; }
