import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  NotificationDeliveryError,
  type NotificationChannelAdapter,
  type NotificationDeliveryResult,
  type NotificationMessage,
} from "./types";
import { normalizeE164Phone, toMoldcellRecipient } from "./sms-phone";

export type MoldcellTransport = "DIRECT" | "SECURE_RELAY";

export type MoldcellSmsConfiguration = Readonly<{
  transport: MoldcellTransport;
  baseUrl: string | null;
  providerId: string | null;
  customerId: string | null;
  guid: string | null;
  relayUrl: string | null;
  relayKeyId: string | null;
  relaySecret: string | null;
  sender: string | null;
  template: string | null;
  timeoutMs: number;
  maxCharacters: number;
  retryableResultCodes: ReadonlySet<string>;
  permanentResultCodes: ReadonlySet<string>;
}>;

export type MoldcellConfigurationSummary = Readonly<{
  configured: boolean;
  transport: MoldcellTransport | "UNCONFIGURED";
  senderConfigured: boolean;
  templateConfigured: boolean;
  timeoutMs: number;
  maxCharacters: number;
}>;

type MoldcellProviderReceipt = Readonly<{
  resultDate: string | null;
  resultCount: string | null;
  resultCode: string;
  resultMessage: string | null;
  providerRequestId: string | null;
}>;

type FetchLike = typeof fetch;

export class MoldcellSmsProvider implements NotificationChannelAdapter {
  readonly channel = "sms" as const;

  constructor(
    private readonly configuration: MoldcellSmsConfiguration = moldcellConfigurationFromEnvironment(),
    private readonly fetchImplementation: FetchLike = fetch,
  ) {}

  async send(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    const recipient = normalizeE164Phone(message.recipient);
    if (!recipient) throw new NotificationDeliveryError("invalid_recipient", false);
    const text = validateSmsText(message.text, this.configuration.maxCharacters);
    if (!text) throw new NotificationDeliveryError("invalid_message", false);
    assertConfigured(this.configuration);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMs);
    try {
      const response = this.configuration.transport === "DIRECT"
        ? await this.sendDirect(recipient, text, controller.signal)
        : await this.sendThroughRelay(recipient, text, message, controller.signal);
      const receipt = await parseReceipt(response);
      if (!response.ok) throw httpError(response.status, receipt);
      if (receipt.resultCode !== "0") {
        const classification = classifyProviderFailure(receipt.resultCode, this.configuration);
        throw new NotificationDeliveryError(
          classification.category,
          classification.retryable,
          receipt.resultCode,
          receipt.resultDate,
          safeProviderMessage(receipt.resultMessage),
        );
      }
      return {
        provider: "moldcell",
        providerMessageId: receipt.providerRequestId,
        providerStatus: "PROVIDER_ACCEPTED",
        providerCode: receipt.resultCode,
        providerMessage: safeProviderMessage(receipt.resultMessage),
        providerTimestamp: receipt.resultDate,
        rawReceiptReference: null,
      };
    } catch (error) {
      if (error instanceof NotificationDeliveryError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new NotificationDeliveryError("timeout", true);
      }
      throw new NotificationDeliveryError("network", true);
    } finally {
      clearTimeout(timeout);
    }
  }

  private sendDirect(
    recipient: string,
    text: string,
    signal: AbortSignal,
  ): Promise<Response> {
    const config = this.configuration;
    const base = new URL(config.baseUrl!);
    const path = `/rest/${encodeURIComponent(config.providerId!)}/${encodeURIComponent(config.customerId!)}/sendSMS`;
    const url = new URL(path, base);
    url.searchParams.set("guid", config.guid!);
    url.searchParams.set("from", config.sender!);
    url.searchParams.set("template", config.template!);
    url.searchParams.set("to", toMoldcellRecipient(recipient)!);
    url.searchParams.set("customText", text);
    return this.fetchImplementation(url, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal,
      headers: { Accept: "application/json" },
    });
  }

  private sendThroughRelay(
    recipient: string,
    text: string,
    message: NotificationMessage,
    signal: AbortSignal,
  ): Promise<Response> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomUUID();
    const body = JSON.stringify({
      deliveryId: message.deliveryId,
      idempotencyKey: message.idempotencyKey,
      recipient,
      message: text,
      sender: this.configuration.sender,
      template: this.configuration.template,
    });
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const signature = createHmac("sha256", this.configuration.relaySecret!)
      .update([timestamp, nonce, bodyHash, message.idempotencyKey ?? ""].join("\n"))
      .digest("hex");
    return this.fetchImplementation(this.configuration.relayUrl!, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey ?? message.deliveryId ?? nonce,
        "X-Correlation-Id": message.deliveryId ?? nonce,
        "X-NSD-Key-Id": this.configuration.relayKeyId!,
        "X-NSD-Timestamp": timestamp,
        "X-NSD-Nonce": nonce,
        "X-NSD-Signature": `sha256=${signature}`,
      },
      body,
    });
  }
}

export function moldcellConfigurationFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): MoldcellSmsConfiguration {
  const transport = environment.MOLDCELL_TRANSPORT === "DIRECT" ? "DIRECT" : "SECURE_RELAY";
  return Object.freeze({
    transport,
    baseUrl: validHttpsUrl(environment.MOLDCELL_BASE_URL),
    providerId: boundedIdentifier(environment.MOLDCELL_PROVIDER_ID),
    customerId: boundedIdentifier(environment.MOLDCELL_CUSTOMER_ID),
    guid: boundedSecret(environment.MOLDCELL_GUID),
    relayUrl: validSecureRelayUrl(environment.MOLDCELL_RELAY_URL),
    relayKeyId: boundedIdentifier(environment.MOLDCELL_RELAY_KEY_ID),
    relaySecret: boundedSecret(environment.MOLDCELL_RELAY_SECRET),
    sender: boundedPolicyValue(environment.MOLDCELL_SENDER, 20),
    template: boundedPolicyValue(environment.MOLDCELL_TEMPLATE, 80),
    timeoutMs: boundedInteger(environment.MOLDCELL_TIMEOUT_MS, 10_000, 1_000, 30_000),
    maxCharacters: boundedInteger(environment.MOLDCELL_SMS_MAX_CHARACTERS, 70, 11, 160),
    retryableResultCodes: codeSet(environment.MOLDCELL_RETRYABLE_RESULT_CODES),
    permanentResultCodes: codeSet(environment.MOLDCELL_PERMANENT_RESULT_CODES),
  });
}

export function summarizeMoldcellConfiguration(
  configuration: MoldcellSmsConfiguration = moldcellConfigurationFromEnvironment(),
): MoldcellConfigurationSummary {
  return Object.freeze({
    configured: isConfigured(configuration),
    transport: isConfigured(configuration) ? configuration.transport : "UNCONFIGURED",
    senderConfigured: Boolean(configuration.sender),
    templateConfigured: Boolean(configuration.template),
    timeoutMs: configuration.timeoutMs,
    maxCharacters: configuration.maxCharacters,
  });
}

function isConfigured(config: MoldcellSmsConfiguration): boolean {
  const provider = config.transport === "DIRECT"
    ? config.baseUrl && config.providerId && config.customerId && config.guid
    : config.relayUrl && config.relayKeyId && config.relaySecret;
  return Boolean(provider && config.sender && config.template);
}

function assertConfigured(config: MoldcellSmsConfiguration): void {
  if (!isConfigured(config)) throw new NotificationDeliveryError("configuration", false);
}

function validateSmsText(value: string, maxCharacters: number): string | null {
  const text = value.trim();
  const length = [...text].length;
  return length > 0 && length <= maxCharacters && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)
    ? text : null;
}

async function parseReceipt(response: Response): Promise<MoldcellProviderReceipt> {
  const raw = (await response.text()).slice(0, 65_536);
  let value: unknown;
  try {
    value = JSON.parse(raw);
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    if (response.status === 401 || response.status === 403) {
      throw new NotificationDeliveryError("authentication", false);
    }
    if (response.status === 429) throw new NotificationDeliveryError("rate_limit", true);
    if (response.status >= 500) throw new NotificationDeliveryError("unavailable", true);
    throw new NotificationDeliveryError("invalid_payload", false);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NotificationDeliveryError("invalid_payload", false);
  }
  const record = value as Record<string, unknown>;
  const resultCode = scalar(record.resultCode) ?? (!response.ok ? `HTTP_${response.status}` : null);
  if (resultCode === null) throw new NotificationDeliveryError("invalid_payload", false);
  return {
    resultCode,
    resultDate: scalar(record.resultDate),
    resultCount: scalar(record.resultCount),
    resultMessage: scalar(record.resultMessage),
    providerRequestId: scalar(record.providerRequestId ?? record.requestId),
  };
}

function httpError(status: number, receipt: MoldcellProviderReceipt): NotificationDeliveryError {
  if (status === 401 || status === 403) return new NotificationDeliveryError("authentication", false, receipt.resultCode, receipt.resultDate);
  if (status === 429) return new NotificationDeliveryError("rate_limit", true, receipt.resultCode, receipt.resultDate);
  if (status >= 500) return new NotificationDeliveryError("unavailable", true, receipt.resultCode, receipt.resultDate);
  return new NotificationDeliveryError("rejected", false, receipt.resultCode, receipt.resultDate);
}

function classifyProviderFailure(code: string, configuration: MoldcellSmsConfiguration) {
  if (configuration.retryableResultCodes.has(code)) return { category: "unavailable" as const, retryable: true };
  if (configuration.permanentResultCodes.has(code)) return { category: "rejected" as const, retryable: false };
  return { category: "unknown" as const, retryable: false };
}

function scalar(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function safeProviderMessage(value: string | null): string | null {
  return value ? value.replace(/[\r\n\t]+/g, " ").slice(0, 160) : null;
}

function boundedSecret(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length >= 8 && trimmed.length <= 500 ? trimmed : null;
}

function boundedIdentifier(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 && trimmed.length <= 200 && /^[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : null;
}

function boundedPolicyValue(value: string | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 && trimmed.length <= max && /^[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : null;
}

function validHttpsUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function validSecureRelayUrl(value: string | undefined): string | null {
  const url = validHttpsUrl(value);
  if (!url) return null;
  return new URL(url).pathname.replace(/\/+$/, "") === "/notification/moldcell-send" ? null : url;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function codeSet(value: string | undefined): ReadonlySet<string> {
  return new Set((value ?? "").split(",").map((code) => code.trim()).filter((code) => /^[A-Za-z0-9_.-]{1,40}$/.test(code)));
}
