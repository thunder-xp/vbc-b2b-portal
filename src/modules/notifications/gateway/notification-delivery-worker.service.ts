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
    } = {},
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.channel, adapter]));
  }

  async run(): Promise<NotificationWorkerResult> {
    const startedAt = performance.now();
    if (externalEmailBlockReason()) {
      return { claimed: 0, sent: 0, suppressed: 0, failed: 0, deadLetter: 0, durationMs: 0, providerDurationMs: 0 };
    }
    const deliveries = await this.repository.claim(
      this.options.batchSize ?? DEFAULT_BATCH_SIZE,
      this.options.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
    );
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
      const activation = this.options.activationPolicy ?? communicationActivationPolicyFromEnvironment();
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
      if (delivery.eventType !== "order.registered_in_1c"
        || ![1, 2].includes(delivery.payloadVersion)
        || ![1, 2].includes(delivery.templateVersion)) {
        throw new NotificationDeliveryError("invalid_payload", false);
      }
      let message = {
        ...renderOrderConfirmedEmail(
          delivery.payload,
          delivery.recipient,
          undefined,
          delivery.payloadVersion,
        ),
        messageId: `<notification-${delivery.deliveryId}@nsd.md>`,
      };
      if (delivery.channelMode === "SANDBOX") {
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
      }
      const safetyBlock = externalEmailBlockReason();
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
        durationMs: providerDurationMs,
      };
      return { completion, providerDurationMs };
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
        durationMs: providerDurationMs,
      };
      return { completion, providerDurationMs };
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
    };
  }
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
