import "server-only";

import type { PaymentProvider } from "../payment-provider";
import { PaymentProviderError } from "../payment-provider";
import type {
  MaibPaymentEvidence,
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProviderRefundState,
  PaymentRefundEvidence,
  PaymentRefundProviderInput,
  PaymentRefundProviderResult,
} from "../../types";

const SANDBOX_ORIGIN = "https://sandbox.maibmerchants.md";
const CHECKOUT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,80}$/;

type MaibConfiguration = Readonly<{
  clientId: string;
  clientSecret: string;
  signatureKey: string;
  apiBaseUrl: string;
  publicAppUrl: string;
}>;

export type MaibConfigurationSummary = Readonly<{
  ready: boolean;
  sandbox: boolean;
  missing: string[];
}>;

export class MaibCheckoutV2Adapter implements PaymentProvider {
  readonly provider = "maib" as const;
  private cachedAccessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly configuration: MaibConfiguration,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    const authStart = performance.now();
    const accessToken = await this.getAccessToken();
    const authLatencyMs = Math.round(performance.now() - authStart);
    const checkoutStart = performance.now();
    const response = await this.request("/v2/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(input.amount),
        currency: input.currency,
        orderInfo: {
          id: input.paymentAttemptId,
          description: `Novotech order ${input.orderNumber}`,
          date: input.orderCreatedAt,
          orderAmount: Number(input.amount),
          orderCurrency: input.currency,
        },
        language: input.locale,
        callbackUrl: this.publicUrl("/api/payments/maib/callback"),
        successUrl: this.publicUrl(`/payment/return?provider=maib&paymentAttemptId=${encodeURIComponent(input.paymentAttemptId)}`),
        failUrl: this.publicUrl(`/payment/return?provider=maib&paymentAttemptId=${encodeURIComponent(input.paymentAttemptId)}`),
      }),
    }, "checkout");
    const checkoutLatencyMs = Math.round(performance.now() - checkoutStart);
    const payload = await safeJson(response, "checkout");
    if (!response.ok || payload.ok !== true) throw providerResponseError("checkout", response.status, payload, response.ok);
    const result = objectValue(payload.result);
    const checkoutId = stringValue(result.checkoutId);
    const checkoutUrl = stringValue(result.checkoutUrl);
    if (!checkoutId || !CHECKOUT_ID.test(checkoutId) || !checkoutUrl || !isSafeMaibCheckoutUrl(checkoutUrl)) {
      throw new PaymentProviderError("checkout", "INVALID_CHECKOUT_RESPONSE", true, response.status);
    }
    return { checkoutId: checkoutId.toLowerCase(), checkoutUrl, providerStatus: "WaitingForInit", authLatencyMs, checkoutLatencyMs, httpCalls: 2 };
  }

  async getCheckoutEvidence(checkoutId: string): Promise<MaibPaymentEvidence> {
    if (!CHECKOUT_ID.test(checkoutId)) throw new PaymentProviderError("lookup", "INVALID_CHECKOUT_ID", false);
    const accessToken = await this.getAccessToken();
    const response = await this.request(`/v2/checkouts/${checkoutId.toLowerCase()}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    }, "lookup");
    const payload = await safeJson(response, "lookup");
    if (!response.ok || payload.ok !== true) throw providerResponseError("lookup", response.status, payload, response.ok);
    const checkout = objectValue(payload.result);
    const order = objectValue(checkout.order);
    const payment = objectValue(checkout.payment);
    const resultCheckoutId = stringValue(checkout.id);
    const checkoutStatus = stringValue(checkout.status);
    const paymentId = stringValue(payment.paymentId);
    const orderReference = stringValue(order.id) ?? stringValue(payment.orderId);
    const checkoutAmount = moneyValue(checkout.amount);
    const checkoutCurrency = stringValue(checkout.currency);
    const paymentAmount = moneyValue(payment.amount);
    const paymentCurrency = stringValue(payment.currency);
    const paymentStatus = stringValue(payment.status);
    const providerEventAt = stringValue(payment.executedAt);
    const rrn = nullableSafeString(payment.referenceNumber, 100);
    if (!resultCheckoutId || resultCheckoutId.toLowerCase() !== checkoutId.toLowerCase()
      || !paymentId || !CHECKOUT_ID.test(paymentId) || !orderReference || !CHECKOUT_ID.test(orderReference)
      || !checkoutAmount || !checkoutCurrency || !paymentAmount || !paymentCurrency || !paymentStatus
      || !providerEventAt || Number.isNaN(Date.parse(providerEventAt))
      || (paymentStatus === "Executed" && checkoutStatus !== "Completed")) {
      throw new PaymentProviderError("lookup", "INVALID_LOOKUP_RESPONSE", true, response.status);
    }
    return {
      checkoutId: resultCheckoutId.toLowerCase(), paymentId: paymentId.toLowerCase(), orderReference: orderReference.toLowerCase(),
      checkoutAmount, checkoutCurrency, paymentAmount, paymentCurrency, paymentStatus, providerEventAt, rrn,
    };
  }

  async createRefund(input: PaymentRefundProviderInput): Promise<PaymentRefundProviderResult> {
    if (!CHECKOUT_ID.test(input.paymentId) || input.currency !== "MDL" || !isPositiveMoney(input.amount)
      || input.reason.trim().length < 1 || input.reason.trim().length > 500) {
      throw new PaymentProviderError("refund", "INVALID_REFUND_INPUT", false);
    }
    const authStart = performance.now();
    const accessToken = await this.getAccessToken();
    const authLatencyMs = Math.round(performance.now() - authStart);
    const refundStart = performance.now();
    const response = await this.request(`/v2/payments/${input.paymentId.toLowerCase()}/refund`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(input.amount), reason: input.reason.trim() }),
    }, "refund");
    const refundLatencyMs = Math.round(performance.now() - refundStart);
    const payload = await safeJson(response, "refund");
    if (!response.ok || payload.ok !== true) throw providerResponseError("refund", response.status, payload, response.ok);
    const result = objectValue(payload.result);
    const refundId = stringValue(result.refundId);
    const providerStatus = stringValue(result.status);
    if (!refundId || !CHECKOUT_ID.test(refundId) || !providerStatus || !REFUND_STATUSES.has(providerStatus)) {
      throw new PaymentProviderError("refund", "INVALID_REFUND_RESPONSE", true, response.status);
    }
    return {
      refundId: refundId.toLowerCase(), providerStatus, authLatencyMs, refundLatencyMs,
      httpCalls: 2,
    };
  }

  async getRefundEvidence(refundId: string): Promise<PaymentRefundEvidence> {
    if (!CHECKOUT_ID.test(refundId)) throw new PaymentProviderError("refund_lookup", "INVALID_REFUND_ID", false);
    const accessToken = await this.getAccessToken();
    const response = await this.request(`/v2/payments/refunds/${refundId.toLowerCase()}`, {
      method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    }, "refund_lookup");
    const payload = await safeJson(response, "refund_lookup");
    if (!response.ok || payload.ok !== true) throw providerResponseError("refund_lookup", response.status, payload, response.ok);
    const result = objectValue(payload.result);
    const id = stringValue(result.id) ?? stringValue(result.refundId);
    const paymentId = stringValue(result.paymentId);
    const refundType = stringValue(result.refundType);
    const amount = moneyValue(result.amount);
    const currency = stringValue(result.currency);
    const reason = stringValue(result.refundReason) ?? stringValue(result.reason);
    const status = stringValue(result.status);
    const executedAt = nullableIsoDate(result.executedAt);
    if (!id || id.toLowerCase() !== refundId.toLowerCase() || !paymentId || !CHECKOUT_ID.test(paymentId)
      || (refundType !== "Full" && refundType !== "Partial") || !amount || !currency || !reason
      || !status || !REFUND_STATUSES.has(status) || (status === "Accepted" && !executedAt)) {
      throw new PaymentProviderError("refund_lookup", "INVALID_REFUND_LOOKUP_RESPONSE", true, response.status);
    }
    return { refundId: id.toLowerCase(), paymentId: paymentId.toLowerCase(), refundType, amount, currency, reason, status: status as PaymentRefundEvidence["status"], executedAt };
  }

  async getPaymentRefundState(paymentId: string): Promise<PaymentProviderRefundState> {
    if (!CHECKOUT_ID.test(paymentId)) throw new PaymentProviderError("payment_lookup", "INVALID_PAYMENT_ID", false);
    const accessToken = await this.getAccessToken();
    const response = await this.request(`/v2/payments/${paymentId.toLowerCase()}`, {
      method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    }, "payment_lookup");
    const payload = await safeJson(response, "payment_lookup");
    if (!response.ok || payload.ok !== true) throw providerResponseError("payment_lookup", response.status, payload, response.ok);
    const result = objectValue(payload.result);
    const id = stringValue(result.id) ?? stringValue(result.paymentId);
    const status = stringValue(result.status);
    const amount = moneyValue(result.amount);
    const currency = stringValue(result.currency);
    const refundedAmount = nonNegativeMoneyValue(result.refundedAmount);
    const requestedRefundAmount = nonNegativeMoneyValue(result.requestedRefundAmount);
    const refundableAmount = nonNegativeMoneyValue(result.refundableAmount);
    const isRefundable = typeof result.isRefundable === "boolean" ? result.isRefundable : null;
    if (!id || id.toLowerCase() !== paymentId.toLowerCase() || !status || !PAYMENT_REFUND_STATUSES.has(status)
      || !amount || !currency || refundedAmount === null || requestedRefundAmount === null
      || refundableAmount === null || isRefundable === null) {
      throw new PaymentProviderError("payment_lookup", "INVALID_PAYMENT_LOOKUP_RESPONSE", true, response.status);
    }
    return { paymentId: id.toLowerCase(), status: status as PaymentProviderRefundState["status"], amount, currency, refundedAmount, requestedRefundAmount, refundableAmount, isRefundable };
  }

  private async getAccessToken() {
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > Date.now() + 5_000) return this.cachedAccessToken.value;
    const response = await this.request("/v2/auth/token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: this.configuration.clientId, clientSecret: this.configuration.clientSecret }),
    }, "auth");
    const payload = await safeJson(response, "auth");
    if (!response.ok || payload.ok !== true) throw providerResponseError("auth", response.status, payload, false);
    const result = objectValue(payload.result);
    const accessToken = stringValue(result.accessToken);
    const expiresIn = numberValue(result.expiresIn);
    const tokenType = stringValue(result.tokenType);
    if (!accessToken || accessToken.length > 4096 || expiresIn === null || expiresIn <= 0 || tokenType?.toLowerCase() !== "bearer") {
      throw new PaymentProviderError("auth", "INVALID_AUTH_RESPONSE", false, response.status);
    }
    this.cachedAccessToken = { value: accessToken, expiresAt: Date.now() + Math.min(expiresIn, 300) * 1_000 };
    return accessToken;
  }

  private async request(path: string, init: RequestInit, stage: ProviderStage) {
    try {
      return await this.fetchImplementation(new URL(path, `${this.configuration.apiBaseUrl}/`), {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      const safeCode = stage === "auth" ? "AUTH_NETWORK_ERROR"
        : stage === "checkout" ? "CHECKOUT_NETWORK_ERROR"
        : stage === "refund" ? "REFUND_NETWORK_ERROR"
        : "LOOKUP_NETWORK_ERROR";
      throw new PaymentProviderError(stage, safeCode, stage !== "auth");
    }
  }

  private publicUrl(path: string) { return new URL(path, `${this.configuration.publicAppUrl}/`).toString(); }
}

export function createMaibCheckoutV2Adapter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  fetchImplementation: typeof fetch = fetch,
) {
  return new MaibCheckoutV2Adapter(maibConfigurationFromEnvironment(environment), fetchImplementation);
}

export function maibConfigurationSummary(environment: Readonly<Record<string, string | undefined>> = process.env): MaibConfigurationSummary {
  const required = ["MAIB_CLIENT_ID", "MAIB_CLIENT_SECRET", "MAIB_SIGNATURE_KEY", "MAIB_API_BASE_URL", "PUBLIC_APP_URL"] as const;
  const missing = required.filter((name) => !environment[name]?.trim());
  let sandbox = false;
  try { sandbox = normalizeSandboxBaseUrl(environment.MAIB_API_BASE_URL) === SANDBOX_ORIGIN; } catch { sandbox = false; }
  return { ready: missing.length === 0 && sandbox && isSafePublicAppUrl(environment.PUBLIC_APP_URL), sandbox, missing };
}

function maibConfigurationFromEnvironment(environment: Readonly<Record<string, string | undefined>>): MaibConfiguration {
  const summary = maibConfigurationSummary(environment);
  if (!summary.ready) throw new PaymentProviderError("configuration", summary.missing.length ? "MAIB_CONFIGURATION_MISSING" : "MAIB_CONFIGURATION_INVALID", false);
  return Object.freeze({
    clientId: environment.MAIB_CLIENT_ID!.trim(),
    clientSecret: environment.MAIB_CLIENT_SECRET!.trim(),
    signatureKey: environment.MAIB_SIGNATURE_KEY!.trim(),
    apiBaseUrl: normalizeSandboxBaseUrl(environment.MAIB_API_BASE_URL),
    publicAppUrl: normalizePublicAppUrl(environment.PUBLIC_APP_URL),
  });
}

function normalizeSandboxBaseUrl(value: string | undefined) {
  const url = new URL(value?.trim() ?? "");
  if (url.origin !== SANDBOX_ORIGIN || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash || url.username || url.password) throw new Error("invalid sandbox url");
  return url.origin;
}

function normalizePublicAppUrl(value: string | undefined) {
  const url = new URL(value?.trim() ?? "");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("invalid public app url");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

function isSafePublicAppUrl(value: string | undefined) { try { normalizePublicAppUrl(value); return true; } catch { return false; } }
function isSafeMaibCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (url.hostname === "checkout-sandbox.maib.md" || url.hostname === "checkout.maib.md");
  } catch { return false; }
}
function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown) { return typeof value === "string" && value.length > 0 ? value : null; }
function numberValue(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function moneyValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || Math.abs(Math.round(value * 100) - value * 100) > 1e-7) return null;
  return value.toFixed(2);
}
function nullableSafeString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

type ProviderStage = "auth" | "checkout" | "lookup" | "refund" | "refund_lookup" | "payment_lookup";
const REFUND_STATUSES = new Set(["Created", "Requested", "Accepted", "Rejected", "Manual"]);
const PAYMENT_REFUND_STATUSES = new Set(["Executed", "PartiallyRefunded", "Refunded", "Failed"]);
function isPositiveMoney(value: string) { return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0; }
function nonNegativeMoneyValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || Math.abs(Math.round(value * 100) - value * 100) > 1e-7) return null;
  return value.toFixed(2);
}
function nullableIsoDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

async function safeJson(response: Response, stage: ProviderStage) {
  try { return objectValue(await response.json()); }
  catch { throw new PaymentProviderError(stage, "INVALID_JSON_RESPONSE", stage !== "auth" && response.ok, response.status); }
}

function providerResponseError(stage: ProviderStage, status: number, payload: Record<string, unknown>, successfulHttp: boolean) {
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const first = objectValue(errors[0]);
  const candidate = stringValue(first.errorCode) ?? stringValue(first.code);
  const safe = candidate && SAFE_CODE.test(candidate) ? candidate.toUpperCase() : `HTTP_${status}`;
  const ambiguous = stage !== "auth" && (successfulHttp || status >= 500 || status === 408 || status === 429);
  return new PaymentProviderError(stage, safe, ambiguous, status);
}
