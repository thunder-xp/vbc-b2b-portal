import "server-only";

import { externalEmailBlockReason } from "@/src/lib/email/external-email-safety";

import type {
  CompleteNotificationDeliveryInput,
  NotificationDeliveryRepository,
} from "./notification-delivery.repository";
import { renderOrderConfirmedEmail } from "./order-confirmed.email";
import {
  communicationActivationPolicyFromEnvironment,
  evaluateCommunicationPolicy,
  markSandboxEmail,
  type CommunicationActivationPolicy,
} from "./communication-policy.service";
import {
  NotificationDeliveryError,
  type ClaimedNotificationDelivery,
  type NotificationChannelAdapter,
  type NotificationDeliveryResult,
  type NotificationWorkerResult,
} from "./types";

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_LEASE_SECONDS = 90;

export class NotificationDeliveryWorkerService {
  private readonly adapters: ReadonlyMap<string, NotificationChannelAdapter>;

  constructor(
    private readonly repository: NotificationDeliveryRepository,
    adapters: NotificationChannelAdapter[],
    private readonly options: {
      batchSize?: number;
      concurrency?: number;
      leaseSeconds?: number;
      activationPolicy?: CommunicationActivationPolicy;
      environment?: Readonly<Record<string, string | undefined>>;
    } = {},
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.channel, adapter]));
  }

  async run(): Promise<NotificationWorkerResult> {
    if (this.environment().COMMUNICATION_OUTBOUND_KILL_SWITCH === "ON") return emptyResult();
    const deliveries = await this.repository.claim(
      this.options.batchSize ?? DEFAULT_BATCH_SIZE,
      this.options.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
    );
    return this.process(deliveries);
  }

  async runOne(deliveryId: string): Promise<NotificationWorkerResult> {
    if (this.environment().COMMUNICATION_OUTBOUND_KILL_SWITCH === "ON") return emptyResult();
    const delivery = await this.repository.claimSpecific(
      deliveryId,
      this.options.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
    );
    return this.process(delivery ? [delivery] : []);
  }

  private async process(deliveries: ClaimedNotificationDelivery[]): Promise<NotificationWorkerResult> {
    const startedAt = performance.now();
    const rateLimits = deliveries.length
      ? await this.repository.reserveRateLimits(deliveries.map((delivery) => ({
        deliveryId: delivery.deliveryId,
        leaseToken: delivery.leaseToken,
      })))
      : [];
    const rateLimitByDelivery = new Map(rateLimits.map((result) => [result.deliveryId, result.outcome]));
    const attempts = await mapWithConcurrency(
      deliveries,
      this.options.concurrency ?? DEFAULT_CONCURRENCY,
      (delivery) => this.deliver(delivery, rateLimitByDelivery.get(delivery.deliveryId) ?? "RATE_LIMITED"),
    );
    const persisted = attempts.length
      ? await this.repository.completeBatch(attempts.map((attempt) => attempt.completion))
      : [];
    const outcomes = attempts.map((attempt, index) => ({
      ...attempt,
      status: persisted[index]?.status ?? "stale_claim",
    }));
    outcomes.forEach((outcome, index) => {
      const delivery = deliveries[index]!;
      const event = outcome.status === "sent"
        ? "notification_delivery_sent"
        : outcome.status === "suppressed"
          ? "notification_delivery_suppressed"
        : outcome.status === "dead_letter"
          ? "notification_delivery_dead_letter"
          : "notification_delivery_failed";
      const logger = outcome.status === "sent" ? console.info : console.warn;
      logger({
        ...logFields(event, delivery),
        durationMs: outcome.providerDurationMs,
        errorCategory: outcome.completion.errorCategory ?? null,
      });
    });
    const result = {
      claimed: deliveries.length,
      sent: outcomes.filter((outcome) => outcome.status === "sent").length,
      suppressed: outcomes.filter((outcome) => outcome.status === "suppressed").length,
      failed: outcomes.filter((outcome) =>
        outcome.status !== "sent" && outcome.status !== "suppressed" && outcome.status !== "dead_letter").length,
      deadLetter: outcomes.filter((outcome) => outcome.status === "dead_letter").length,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      providerDurationMs: outcomes.reduce((sum, outcome) => sum + outcome.providerDurationMs, 0),
      attempts: outcomes.map((outcome, index) => ({
        deliveryId: deliveries[index]!.deliveryId,
        attemptId: deliveries[index]!.attemptId ?? null,
        status: outcome.status,
        provider: outcome.providerResult?.provider ?? null,
        providerStatus: outcome.providerResult?.providerStatus ?? null,
        providerCode: outcome.providerResult?.providerCode ?? outcome.providerError?.providerCode ?? null,
        providerMessage: outcome.providerResult?.providerMessage ?? outcome.providerError?.providerMessage ?? null,
        providerTimestamp: outcome.providerResult?.providerTimestamp ?? outcome.providerError?.providerTimestamp ?? null,
        durationMs: outcome.providerDurationMs,
      })),
    };
    return result;
  }

  private async deliver(delivery: ClaimedNotificationDelivery, rateLimitOutcome: "ALLOWED" | "RATE_LIMITED") {
    const startedAt = performance.now();
    const adapter = this.adapters.get(delivery.channel);
    console.info(logFields("notification_delivery_claimed", delivery));
    try {
      const purpose = delivery.purpose ?? (delivery.eventType === "order.registered_in_1c" ? "TRANSACTIONAL" : undefined);
      if (!purpose) return this.policySuppression(delivery, "PURPOSE_DISABLED", startedAt);
      const activation = this.options.activationPolicy ?? communicationActivationPolicyFromEnvironment(this.environment());
      const beforeLimit = evaluateCommunicationPolicy({
        intent: {
          purpose,
          businessEventType: delivery.eventType,
          companyId: delivery.companyId,
          recipient: {
            userId: "governed-recipient",
            companyId: delivery.companyId,
            locale: delivery.recipientLocale ?? "ru",
            email: delivery.channel === "email" ? delivery.recipient : null,
            phone: delivery.channel === "sms" ? delivery.recipient : null,
            identityVerified: true,
            membershipActive: true,
            capabilityAuthorized: true,
          },
        },
        channel: delivery.channel === "telegram" ? "sms" : delivery.channel,
        mode: delivery.channelMode ?? "LIVE",
        activation,
        preferenceOutcome: delivery.preferenceOutcome,
        providerAvailable: Boolean(adapter),
      });
      if (beforeLimit.decision === "SUPPRESS") {
        return this.policySuppression(delivery, beforeLimit.reason!, startedAt);
      }
      const finalPolicy = evaluateCommunicationPolicy({
        intent: {
          purpose,
          businessEventType: delivery.eventType,
          companyId: delivery.companyId,
          recipient: {
            userId: "governed-recipient",
            companyId: delivery.companyId,
            locale: delivery.recipientLocale ?? "ru",
            email: delivery.channel === "email" ? delivery.recipient : null,
            phone: delivery.channel === "sms" ? delivery.recipient : null,
            identityVerified: true,
            membershipActive: true,
            capabilityAuthorized: true,
          },
        },
        channel: delivery.channel === "telegram" ? "sms" : delivery.channel,
        mode: delivery.channelMode ?? "LIVE",
        activation,
        preferenceOutcome: delivery.preferenceOutcome,
        rateLimitOutcome,
        providerAvailable: Boolean(adapter),
      });
      if (finalPolicy.decision === "SUPPRESS") {
        return this.policySuppression(delivery, finalPolicy.reason!, startedAt);
      }
      if (!adapter) throw new NotificationDeliveryError("unsupported_channel", false);
      let message = {
        ...renderDeliveryMessage(delivery),
        deliveryId: delivery.deliveryId,
        idempotencyKey: delivery.idempotencyKey,
        locale: delivery.recipientLocale ?? "ru",
        messageId: `<notification-${delivery.deliveryId}@nsd.md>`,
      };
      if (delivery.channelMode === "SANDBOX" && delivery.channel === "email") {
        const marked = markSandboxEmail({
          purpose,
          companyId: delivery.companyId,
          originalRecipientFingerprint: finalPolicy.originalRecipientFingerprint,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        message = {
          ...message,
          ...marked,
          recipient: finalPolicy.sandboxActualRecipient!,
        };
      } else if (delivery.channelMode === "SANDBOX" && delivery.channel === "sms") {
        message = { ...message, recipient: finalPolicy.sandboxActualRecipient! };
      }
      const safetyBlock = delivery.channel === "email"
        ? externalEmailBlockReason()
        : delivery.channel === "sms" ? externalSmsBlockReason(this.environment()) : "CHANNEL_KILL_SWITCH";
      if (safetyBlock) {
        throw new NotificationDeliveryError(
          safetyBlock === "GLOBAL_KILL_SWITCH" ? "global_kill_switch" : "channel_kill_switch",
          true,
        );
      }
      const providerStartedAt = performance.now();
      const providerResult = await adapter.send(message);
      const providerDurationMs = Math.max(0, Math.round(performance.now() - providerStartedAt));
      const completion: CompleteNotificationDeliveryInput = {
        deliveryId: delivery.deliveryId,
        leaseToken: delivery.leaseToken,
        succeeded: true,
        retryable: false,
        providerMessageId: providerResult.providerMessageId,
        providerCode: providerResult.providerCode,
        providerMessage: providerResult.providerMessage,
        providerTimestamp: providerResult.providerTimestamp,
        durationMs: providerDurationMs,
      };
      return { completion, providerDurationMs, providerResult, providerError: null };
    } catch (error) {
      const normalized = error instanceof NotificationDeliveryError
        ? error
        : new NotificationDeliveryError("unavailable", true);
      const providerDurationMs = Math.max(0, Math.round(performance.now() - startedAt));
      const completion: CompleteNotificationDeliveryInput = {
        deliveryId: delivery.deliveryId,
        leaseToken: delivery.leaseToken,
        succeeded: false,
        retryable: normalized.retryable,
        errorCategory: normalized.category,
        providerCode: normalized.providerCode,
        providerMessage: normalized.providerMessage,
        providerTimestamp: normalized.providerTimestamp,
        durationMs: providerDurationMs,
      };
      return { completion, providerDurationMs, providerResult: null, providerError: normalized };
    }
  }

  private policySuppression(
    delivery: ClaimedNotificationDelivery,
    reason: string,
    startedAt: number,
  ) {
    const providerDurationMs = Math.max(0, Math.round(performance.now() - startedAt));
    return {
      completion: {
        deliveryId: delivery.deliveryId,
        leaseToken: delivery.leaseToken,
        succeeded: false,
        retryable: false,
        errorCategory: reason,
        durationMs: providerDurationMs,
      } satisfies CompleteNotificationDeliveryInput,
      providerDurationMs,
      providerResult: null as NotificationDeliveryResult | null,
      providerError: null as NotificationDeliveryError | null,
    };
  }

  private environment(): Readonly<Record<string, string | undefined>> {
    return this.options.environment ?? process.env;
  }
}

function renderDeliveryMessage(delivery: ClaimedNotificationDelivery) {
  if (delivery.channel === "email"
    && delivery.eventType === "order.registered_in_1c"
    && [1, 2].includes(delivery.payloadVersion)
    && [1, 2].includes(delivery.templateVersion)) {
    return renderOrderConfirmedEmail(
      delivery.payload,
      delivery.recipient,
      undefined,
      delivery.payloadVersion,
    );
  }
  if (delivery.channel === "sms"
    && delivery.channelMode === "SANDBOX"
    && delivery.purpose === "SUPPORT"
    && delivery.eventType === "support.sms_sandbox_test") {
    const snapshot = delivery.renderedSnapshot;
    if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
      const value = snapshot as Record<string, unknown>;
      if (typeof value.textBody === "string" && typeof value.subject === "string") {
        return {
          recipient: delivery.recipient,
          subject: value.subject,
          text: value.textBody,
          html: "",
        };
      }
    }
  }
  throw new NotificationDeliveryError("invalid_payload", false);
}

function externalSmsBlockReason(
  environment: Readonly<Record<string, string | undefined>>,
): "GLOBAL_KILL_SWITCH" | "CHANNEL_KILL_SWITCH" | null {
  if (environment.COMMUNICATION_OUTBOUND_KILL_SWITCH === "ON") return "GLOBAL_KILL_SWITCH";
  if (environment.COMMUNICATION_SMS_KILL_SWITCH !== "OFF" || environment.SMS_MODE !== "SANDBOX") {
    return "CHANNEL_KILL_SWITCH";
  }
  return null;
}

function emptyResult(): NotificationWorkerResult {
  return { claimed: 0, sent: 0, suppressed: 0, failed: 0, deadLetter: 0, durationMs: 0, providerDurationMs: 0, attempts: [] };
}

function logFields(event: string, delivery: ClaimedNotificationDelivery) {
  return {
    event,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    deliveryId: delivery.deliveryId,
    channel: delivery.channel,
    companyId: delivery.companyId,
    partnerOrderId: delivery.partnerOrderId,
    attempt: delivery.attempt,
    correlationId: delivery.correlationId,
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  callback: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from(
    { length: Math.min(Math.max(concurrency, 1), values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await callback(values[index]!);
      }
    },
  ));
  return results;
}
