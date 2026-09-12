import "server-only";

import { NotificationDeliveryError } from "./types";
import { normalizeE164Phone } from "./sms-phone";
import type {
  NotificationChannelAdapter,
  NotificationDeliveryResult,
  NotificationMessage,
} from "./types";

export type SmsProviderSendInput = Readonly<{
  deliveryId: string;
  recipient: string;
  message: string;
  locale: "ru" | "ro";
  idempotencyKey: string;
}>;

export type SmsProviderResult = Readonly<{
  provider: string;
  accepted: boolean;
  providerCode: string;
  providerMessage: string | null;
  providerTimestamp: string | null;
  providerReference: string | null;
  retryability: "NONE" | "RETRYABLE" | "PERMANENT";
  failureCategory: "INVALID_MSISDN" | "OUTNET_NOT_ALLOWED" | "UNKNOWN_PROVIDER_FAILURE" | null;
}>;

export interface SmsProvider {
  readonly provider: string;
  send(input: SmsProviderSendInput): Promise<SmsProviderResult>;
}

export interface SmsProviderResolver {
  resolve(recipient: string): SmsProvider | null;
}

export function resolveSmsProviderIdentity(recipient: string): "moldcell" | null {
  return recipient.startsWith("+373") ? "moldcell" : null;
}

export class PrefixSmsProviderResolver implements SmsProviderResolver {
  constructor(private readonly routes: ReadonlyArray<Readonly<{ prefix: string; provider: SmsProvider }>>) {}

  resolve(recipient: string): SmsProvider | null {
    return this.routes.find((route) => recipient.startsWith(route.prefix))?.provider ?? null;
  }
}

export class SmsChannelAdapter implements NotificationChannelAdapter {
  readonly channel = "sms" as const;

  constructor(private readonly resolver: SmsProviderResolver) {}

  async send(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    const recipient = normalizeE164Phone(message.recipient);
    if (!recipient) throw new NotificationDeliveryError("invalid_recipient", false);
    const provider = this.resolver.resolve(recipient);
    if (!provider) {
      throw new NotificationDeliveryError(
        "no_sms_provider_for_destination",
        false,
        "NO_SMS_PROVIDER_FOR_DESTINATION",
      );
    }
    if (!message.deliveryId || !message.idempotencyKey) {
      throw new NotificationDeliveryError("invalid_payload", false);
    }
    const result = await provider.send({
      deliveryId: message.deliveryId,
      recipient,
      message: message.text,
      locale: message.locale ?? "ru",
      idempotencyKey: message.idempotencyKey,
    });
    if (!result.accepted) {
      throw new NotificationDeliveryError(
        result.failureCategory === "INVALID_MSISDN" ? "invalid_recipient"
          : result.failureCategory === "OUTNET_NOT_ALLOWED" ? "rejected" : "unknown",
        result.retryability === "RETRYABLE",
        result.providerCode,
        result.providerTimestamp,
        result.providerMessage,
      );
    }
    return {
      provider: result.provider,
      providerMessageId: result.providerReference,
      providerStatus: "PROVIDER_ACCEPTED",
      providerCode: result.providerCode,
      providerMessage: result.providerMessage,
      providerTimestamp: result.providerTimestamp,
      rawReceiptReference: null,
    };
  }
}
