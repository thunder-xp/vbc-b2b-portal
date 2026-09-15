import "server-only";

import type { PaymentProvider } from "../payment-provider";
import { PaymentProviderError } from "../payment-provider";
import type { PaymentCheckoutInput, PaymentCheckoutResult } from "../../types";

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
        successUrl: this.publicUrl("/payment/return?provider=maib&result=success"),
        failUrl: this.publicUrl("/payment/return?provider=maib&result=failed"),
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

  private async getAccessToken() {
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
    return accessToken;
  }

  private async request(path: string, init: RequestInit, stage: "auth" | "checkout") {
    try {
      return await this.fetchImplementation(new URL(path, `${this.configuration.apiBaseUrl}/`), {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new PaymentProviderError(stage, stage === "auth" ? "AUTH_NETWORK_ERROR" : "CHECKOUT_NETWORK_ERROR", stage === "checkout");
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

async function safeJson(response: Response, stage: "auth" | "checkout") {
  try { return objectValue(await response.json()); }
  catch { throw new PaymentProviderError(stage, "INVALID_JSON_RESPONSE", stage === "checkout" && response.ok, response.status); }
}

function providerResponseError(stage: "auth" | "checkout", status: number, payload: Record<string, unknown>, successfulHttp: boolean) {
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const first = objectValue(errors[0]);
  const candidate = stringValue(first.errorCode) ?? stringValue(first.code);
  const safe = candidate && SAFE_CODE.test(candidate) ? candidate.toUpperCase() : `HTTP_${status}`;
  const ambiguous = stage === "checkout" && (successfulHttp || status >= 500 || status === 408 || status === 429);
  return new PaymentProviderError(stage, safe, ambiguous, status);
}
