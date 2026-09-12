import "server-only";

import {
  DirectMoldcellTransport,
  RelayMoldcellTransport,
  type MoldcellTransport,
  type MoldcellTransportResponse,
} from "./moldcell.transport";
import {
  PrefixSmsProviderResolver,
  SmsChannelAdapter,
  type SmsProvider,
  type SmsProviderResult,
  type SmsProviderSendInput,
} from "./sms-provider";
import { normalizeE164Phone, toMoldcellRecipient } from "./sms-phone";
import { NotificationDeliveryError } from "./types";

export type MoldcellSmsConfiguration = Readonly<{
  transportMode: "DIRECT" | "RELAY";
  baseUrl: string | null;
  providerId: string | null;
  customerId: string | null;
  guid: string | null;
  relayUrl: string | null;
  relayKeyId: string | null;
  relaySecret: string | null;
  sender: "NSD";
  template: "NSD_NOTIFICATION";
  timeoutMs: number;
  maxCharacters: number;
}>;

export type MoldcellConfigurationSummary = Readonly<{
  configured: boolean;
  transport: "DIRECT" | "RELAY" | "UNCONFIGURED";
  senderConfigured: boolean;
  templateConfigured: boolean;
  timeoutMs: number;
  maxCharacters: number;
}>;

type MoldcellProviderReceipt = Readonly<{
  resultDate: string | null;
  resultCode: string;
  resultMessage: string | null;
  providerRequestId: string | null;
}>;

export class MoldcellSmsProvider implements SmsProvider {
  readonly provider = "moldcell";

  constructor(
    private readonly configuration: MoldcellSmsConfiguration,
    private readonly transport: MoldcellTransport,
  ) {}

  async send(input: SmsProviderSendInput): Promise<SmsProviderResult> {
    assertConfigured(this.configuration);
    if (!input.recipient.startsWith("+373") || normalizeE164Phone(input.recipient) !== input.recipient) {
      throw new NotificationDeliveryError("invalid_recipient", false);
    }
    const message = validateSmsText(input.message, this.configuration.maxCharacters);
    if (!message) throw new NotificationDeliveryError("invalid_message", false);

    const timestamp = Math.floor(Date.now() / 1000);
    const response = await this.transport.send({
      deliveryId: input.deliveryId,
      recipient: input.recipient,
      message,
      idempotencyKey: input.idempotencyKey,
      timestamp,
      providerHttpRequest: this.transport.mode === "DIRECT"
        ? this.buildProviderHttpRequest(input.recipient, message)
        : null,
    });
    const receipt = parseReceipt(response);
    if (!response.ok) throw httpError(response.status, receipt);
    return normalizeReceipt(receipt);
  }

  private buildProviderHttpRequest(recipient: string, message: string) {
    const config = this.configuration;
    if (!config.baseUrl || !config.providerId || !config.customerId || !config.guid) {
      throw new NotificationDeliveryError("configuration", false);
    }
    const base = new URL(config.baseUrl);
    const path = `/rest/${encodeURIComponent(config.providerId)}/${encodeURIComponent(config.customerId)}/sendSMS`;
    const url = new URL(path, base);
    url.searchParams.set("guid", config.guid);
    url.searchParams.set("from", config.sender);
    url.searchParams.set("template", config.template);
    url.searchParams.set("to", toMoldcellRecipient(recipient)!);
    url.searchParams.set("customText", message);
    return {
      url,
      init: {
        method: "GET",
        cache: "no-store" as const,
        redirect: "error" as const,
        headers: { Accept: "application/json" },
      },
    };
  }
}

export function createMoldcellSmsProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  fetchImplementation: typeof fetch = fetch,
): MoldcellSmsProvider {
  const configuration = moldcellConfigurationFromEnvironment(environment);
  const transport: MoldcellTransport = !isConfigured(configuration)
    ? new UnconfiguredMoldcellTransport(configuration.transportMode)
    : configuration.transportMode === "DIRECT"
    ? new DirectMoldcellTransport(configuration.timeoutMs, fetchImplementation)
    : new RelayMoldcellTransport(
      configuration.relayUrl!,
      configuration.relayKeyId!,
      configuration.relaySecret!,
      configuration.timeoutMs,
      fetchImplementation,
    );
  return new MoldcellSmsProvider(configuration, transport);
}

class UnconfiguredMoldcellTransport implements MoldcellTransport {
  constructor(readonly mode: "DIRECT" | "RELAY") {}

  send(): Promise<never> {
    return Promise.reject(new NotificationDeliveryError("configuration", false));
  }
}

export function createMoldcellSmsChannelAdapter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  fetchImplementation: typeof fetch = fetch,
): SmsChannelAdapter {
  const provider = createMoldcellSmsProvider(environment, fetchImplementation);
  return new SmsChannelAdapter(new PrefixSmsProviderResolver([{ prefix: "+373", provider }]));
}

export function moldcellConfigurationFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): MoldcellSmsConfiguration {
  const transportMode = environment.MOLDCELL_TRANSPORT_MODE?.toLowerCase() === "direct" ? "DIRECT" : "RELAY";
  return Object.freeze({
    transportMode,
    baseUrl: validHttpsUrl(environment.MOLDCELL_BASE_URL),
    providerId: boundedIdentifier(environment.MOLDCELL_PROVIDER_ID),
    customerId: boundedIdentifier(environment.MOLDCELL_CUSTOMER_ID),
    guid: boundedSecret(environment.MOLDCELL_GUID),
    relayUrl: validSecureRelayUrl(environment.MOLDCELL_RELAY_URL),
    relayKeyId: boundedIdentifier(environment.MOLDCELL_RELAY_KEY_ID),
    relaySecret: boundedSecret(environment.MOLDCELL_RELAY_AUTH_SECRET),
    sender: "NSD",
    template: "NSD_NOTIFICATION",
    timeoutMs: boundedInteger(environment.MOLDCELL_TIMEOUT_MS, 10_000, 1_000, 30_000),
    maxCharacters: boundedInteger(environment.MOLDCELL_SMS_MAX_CHARACTERS, 70, 11, 160),
  });
}

export function summarizeMoldcellConfiguration(
  configuration: MoldcellSmsConfiguration = moldcellConfigurationFromEnvironment(),
): MoldcellConfigurationSummary {
  return Object.freeze({
    configured: isConfigured(configuration),
    transport: isConfigured(configuration) ? configuration.transportMode : "UNCONFIGURED",
    senderConfigured: configuration.sender === "NSD",
    templateConfigured: configuration.template === "NSD_NOTIFICATION",
    timeoutMs: configuration.timeoutMs,
    maxCharacters: configuration.maxCharacters,
  });
}

function isConfigured(config: MoldcellSmsConfiguration): boolean {
  return config.transportMode === "DIRECT"
    ? Boolean(config.baseUrl && config.providerId && config.customerId && config.guid)
    : Boolean(config.relayUrl && config.relayKeyId && config.relaySecret);
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

function parseReceipt(response: MoldcellTransportResponse): MoldcellProviderReceipt {
  let value: unknown;
  try {
    value = JSON.parse(response.body);
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    if (response.status === 401 || response.status === 403) throw new NotificationDeliveryError("authentication", false);
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
    resultMessage: scalar(record.resultMessage),
    providerRequestId: scalar(record.providerRequestId ?? record.requestId),
  };
}

function normalizeReceipt(receipt: MoldcellProviderReceipt): SmsProviderResult {
  const common = {
    provider: "moldcell",
    providerCode: receipt.resultCode,
    providerMessage: safeProviderMessage(receipt.resultMessage),
    providerTimestamp: receipt.resultDate,
    providerReference: receipt.providerRequestId,
  } as const;
  if (receipt.resultCode === "0") return { ...common, accepted: true, retryability: "NONE", failureCategory: null };
  if (receipt.resultCode === "20001") {
    return { ...common, accepted: false, retryability: "PERMANENT", failureCategory: "INVALID_MSISDN" };
  }
  if (receipt.resultCode === "20012") {
    return { ...common, accepted: false, retryability: "PERMANENT", failureCategory: "OUTNET_NOT_ALLOWED" };
  }
  return { ...common, accepted: false, retryability: "PERMANENT", failureCategory: "UNKNOWN_PROVIDER_FAILURE" };
}

function httpError(status: number, receipt: MoldcellProviderReceipt): NotificationDeliveryError {
  if (status === 401 || status === 403) return new NotificationDeliveryError("authentication", false, receipt.resultCode, receipt.resultDate);
  if (status === 429) return new NotificationDeliveryError("rate_limit", true, receipt.resultCode, receipt.resultDate);
  if (status >= 500) return new NotificationDeliveryError("unavailable", true, receipt.resultCode, receipt.resultDate);
  return new NotificationDeliveryError("rejected", false, receipt.resultCode, receipt.resultDate);
}

function scalar(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function safeProviderMessage(value: string | null): string | null {
  return value ? value.replace(/[\r\n\t]+/g, " ").slice(0, 160) : null;
}

function boundedSecret(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length >= 16 && trimmed.length <= 500 ? trimmed : null;
}

function boundedIdentifier(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 && trimmed.length <= 200 && /^[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : null;
}

function validHttpsUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      ? url.toString() : null;
  } catch {
    return null;
  }
}

function validSecureRelayUrl(value: string | undefined): string | null {
  const url = validHttpsUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  return parsed.pathname.replace(/\/+$/, "") === "/internal/omnichannel/v1/sms/moldcell" ? parsed.toString() : null;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
