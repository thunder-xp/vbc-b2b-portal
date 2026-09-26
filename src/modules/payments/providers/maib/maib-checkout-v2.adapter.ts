import "server-only";

import { createHash } from "node:crypto";

import type { PaymentProvider } from "../payment-provider";
import { PaymentProviderError } from "../payment-provider";
import type {
  MaibCheckoutState,
  MaibPaymentEvidence,
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProviderRefundState,
  PaymentRefundEvidence,
  PaymentRefundProviderInput,
  PaymentRefundProviderResult,
} from "../../types";

const SANDBOX_ORIGIN = "https://sandbox.maibmerchants.md";
const PRODUCTION_ORIGIN = "https://api.maibmerchants.md";
const PRODUCTION_PUBLIC_ORIGIN = "https://www.nsd.md";
const CHECKOUT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,80}$/;

type MaibConfiguration = Readonly<{
  mode: Exclude<MaibPaymentMode, "DISABLED">;
  clientId: string;
  clientSecret: string;
  signatureKey: string;
  apiBaseUrl: string;
  publicAppUrl: string;
}>;

export type MaibPaymentMode = "DISABLED" | "SANDBOX" | "PRODUCTION";

export type MaibConfigurationSummary = Readonly<{
  ready: boolean;
  mode: MaibPaymentMode;
  sandbox: boolean;
  production: boolean;
  apiOrigin: string | null;
  publicOrigin: string | null;
  callbackUrl: string | null;
  returnUrl: string | null;
  clientIdFingerprint: string | null;
  missing: string[];
}>;

export type MaibConnectivityResult = Readonly<{
  status: "PASS";
  mode: Exclude<MaibPaymentMode, "DISABLED">;
  apiOrigin: string;
  clientIdFingerprint: string;
  authLatencyMs: number;
}>;

export class MaibCheckoutV2Adapter implements PaymentProvider {
  readonly provider = "maib" as const;
  private cachedAccessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly configuration: MaibConfiguration,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async verifyConnectivity(): Promise<MaibConnectivityResult> {
    const startedAt = performance.now();
    await this.getAccessToken();
    return {
      status: "PASS",
      mode: this.configuration.mode,
      apiOrigin: this.configuration.apiBaseUrl,
      clientIdFingerprint: fingerprint(this.configuration.clientId),
      authLatencyMs: Math.round(performance.now() - startedAt),
    };
  }

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
    if (!checkoutId || !CHECKOUT_ID.test(checkoutId) || !checkoutUrl || !isSafeMaibCheckoutUrl(checkoutUrl, this.configuration.mode)) {
      throw new PaymentProviderError("checkout", "INVALID_CHECKOUT_RESPONSE", true, response.status);
    }
    return { checkoutId: checkoutId.toLowerCase(), checkoutUrl, providerStatus: "WaitingForInit", authLatencyMs, checkoutLatencyMs, httpCalls: 2 };
  }

  async getCheckoutEvidence(checkoutId: string): Promise<MaibPaymentEvidence> {
    const state = await this.getCheckoutState(checkoutId);
    if (state.kind !== "payment") throw new PaymentProviderError("lookup", "CHECKOUT_NOT_COMPLETED", false);
    return state.evidence;
  }

  async getCheckoutState(checkoutId: string): Promise<MaibCheckoutState> {
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
    const orderReference = stringValue(order.id);
    const checkoutAmount = moneyValue(checkout.amount);
    const checkoutCurrency = stringValue(checkout.currency);
    const createdAt = isoDateValue(checkout.createdAt);
    const expiresAt = isoDateValue(checkout.expiresAt);
    if (!resultCheckoutId || resultCheckoutId.toLowerCase() !== checkoutId.toLowerCase()
      || !checkoutStatus || !CHECKOUT_STATUSES.has(checkoutStatus)
      || !orderReference || !CHECKOUT_ID.test(orderReference)
      || !checkoutAmount || !checkoutCurrency || !createdAt || !expiresAt) {
      throw new PaymentProviderError("lookup", "INVALID_LOOKUP_RESPONSE", true, response.status);
    }

    if (checkoutStatus !== "Completed") {
      const terminal = TERMINAL_CHECKOUT_STATUSES.has(checkoutStatus);
      const providerEventAt = terminal
        ? isoDateValue(checkout.cancelledAt) ?? isoDateValue(checkout.failedAt) ?? expiresAt
        : createdAt;
      return {
        kind: terminal ? "terminal" : "pending",
        checkoutId: resultCheckoutId.toLowerCase(),
        orderReference: orderReference.toLowerCase(),
        amount: checkoutAmount,
        currency: checkoutCurrency,
        checkoutStatus: checkoutStatus as Exclude<MaibCheckoutState, { kind: "payment" }>["checkoutStatus"],
        providerEventAt,
      };
    }

    const paymentId = stringValue(payment.paymentId);
    const paymentOrderReference = stringValue(payment.orderId) ?? orderReference;
    const paymentAmount = moneyValue(payment.amount);
    const paymentCurrency = stringValue(payment.currency);
    const paymentStatus = stringValue(payment.status);
    const providerEventAt = stringValue(payment.executedAt);
    const rrn = nullableSafeString(payment.referenceNumber, 100);
    if (!paymentId || !CHECKOUT_ID.test(paymentId) || !paymentOrderReference || !CHECKOUT_ID.test(paymentOrderReference)
      || !paymentAmount || !paymentCurrency || !paymentStatus
      || !providerEventAt || Number.isNaN(Date.parse(providerEventAt))
      || paymentStatus !== "Executed") {
      throw new PaymentProviderError("lookup", "INVALID_LOOKUP_RESPONSE", true, response.status);
    }
    return { kind: "payment", evidence: {
      checkoutId: resultCheckoutId.toLowerCase(), paymentId: paymentId.toLowerCase(), orderReference: paymentOrderReference.toLowerCase(),
      checkoutAmount, checkoutCurrency, paymentAmount, paymentCurrency, paymentStatus, providerEventAt, rrn,
    } };
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
  const mode = normalizeMode(environment.MAIB_PAYMENT_MODE);
  const required = ["MAIB_CLIENT_ID", "MAIB_CLIENT_SECRET", "MAIB_SIGNATURE_KEY", "MAIB_API_BASE_URL", "PUBLIC_APP_URL"] as const;
  const missing = mode === "DISABLED" ? [] : required.filter((name) => !environment[name]?.trim());
  let apiOrigin: string | null = null;
  let publicOrigin: string | null = null;
  if (mode !== "DISABLED") {
    try { apiOrigin = normalizeApiBaseUrl(environment.MAIB_API_BASE_URL, mode); } catch { apiOrigin = null; }
    try { publicOrigin = normalizePublicAppUrl(environment.PUBLIC_APP_URL, mode); } catch { publicOrigin = null; }
  }
  const ready = mode !== "DISABLED" && missing.length === 0 && apiOrigin !== null && publicOrigin !== null;
  return {
    ready,
    mode,
    sandbox: mode === "SANDBOX",
    production: mode === "PRODUCTION",
    apiOrigin,
    publicOrigin,
    callbackUrl: publicOrigin ? new URL("/api/payments/maib/callback", `${publicOrigin}/`).toString() : null,
    returnUrl: publicOrigin ? new URL("/payment/return", `${publicOrigin}/`).toString() : null,
    clientIdFingerprint: environment.MAIB_CLIENT_ID?.trim() ? fingerprint(environment.MAIB_CLIENT_ID.trim()) : null,
    missing,
  };
}

function maibConfigurationFromEnvironment(environment: Readonly<Record<string, string | undefined>>): MaibConfiguration {
  const summary = maibConfigurationSummary(environment);
  if (!summary.ready) throw new PaymentProviderError("configuration", summary.missing.length ? "MAIB_CONFIGURATION_MISSING" : "MAIB_CONFIGURATION_INVALID", false);
  return Object.freeze({
    mode: summary.mode as Exclude<MaibPaymentMode, "DISABLED">,
    clientId: environment.MAIB_CLIENT_ID!.trim(),
    clientSecret: environment.MAIB_CLIENT_SECRET!.trim(),
    signatureKey: environment.MAIB_SIGNATURE_KEY!.trim(),
    apiBaseUrl: summary.apiOrigin!,
    publicAppUrl: summary.publicOrigin!,
  });
}

function normalizeMode(value: string | undefined): MaibPaymentMode {
  const candidate = value?.trim().toUpperCase();
  return candidate === "SANDBOX" || candidate === "PRODUCTION" || candidate === "DISABLED" ? candidate : "DISABLED";
}

function normalizeApiBaseUrl(value: string | undefined, mode: Exclude<MaibPaymentMode, "DISABLED">) {
  const url = new URL(value?.trim() ?? "");
  const expectedOrigin = mode === "SANDBOX" ? SANDBOX_ORIGIN : PRODUCTION_ORIGIN;
  if (url.origin !== expectedOrigin || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash || url.username || url.password) throw new Error("invalid MAIB API url");
  return url.origin;
}

function normalizePublicAppUrl(value: string | undefined, mode: Exclude<MaibPaymentMode, "DISABLED">) {
  const url = new URL(value?.trim() ?? "");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || (url.pathname !== "/" && url.pathname !== "")
    || (mode === "PRODUCTION" && url.origin !== PRODUCTION_PUBLIC_ORIGIN)) throw new Error("invalid public app url");
  return url.origin;
}

function isSafeMaibCheckoutUrl(value: string, mode: Exclude<MaibPaymentMode, "DISABLED">) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && url.hostname === (mode === "SANDBOX" ? "checkout-sandbox.maib.md" : "checkout.maib.md");
  } catch { return false; }
}
function fingerprint(value: string) { return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12); }
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
const CHECKOUT_STATUSES = new Set(["WaitingForInit", "Initialized", "PaymentMethodSelected", "Completed", "Expired", "Abandoned", "Cancelled", "Failed"]);
const TERMINAL_CHECKOUT_STATUSES = new Set(["Expired", "Abandoned", "Cancelled", "Failed"]);
function isPositiveMoney(value: string) { return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0; }
function nonNegativeMoneyValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || Math.abs(Math.round(value * 100) - value * 100) > 1e-7) return null;
  return value.toFixed(2);
}
function nullableIsoDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}
function isoDateValue(value: unknown) {
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
