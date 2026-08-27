import "server-only";

import type {
  CompleteNotificationDeliveryInput,
  NotificationDeliveryRepository,
} from "./notification-delivery.repository";
import { renderOrderRegisteredInOneCEmail } from "./order-registered-in-one-c.email";
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
    } = {},
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.channel, adapter]));
  }

  async run(): Promise<NotificationWorkerResult> {
    const startedAt = performance.now();
    const deliveries = await this.repository.claim(
      this.options.batchSize ?? DEFAULT_BATCH_SIZE,
      this.options.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
    );
    const attempts = await mapWithConcurrency(
      deliveries,
      this.options.concurrency ?? DEFAULT_CONCURRENCY,
      (delivery) => this.deliver(delivery),
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
      failed: outcomes.filter((outcome) =>
        outcome.status !== "sent" && outcome.status !== "dead_letter").length,
      deadLetter: outcomes.filter((outcome) => outcome.status === "dead_letter").length,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      providerDurationMs: outcomes.reduce((sum, outcome) => sum + outcome.providerDurationMs, 0),
    };
    return result;
  }

  private async deliver(delivery: ClaimedNotificationDelivery) {
    const startedAt = performance.now();
    const adapter = this.adapters.get(delivery.channel);
    console.info(logFields("notification_delivery_claimed", delivery));
    try {
      if (!adapter) throw new NotificationDeliveryError("unsupported_channel", false);
      if (delivery.eventType !== "order.registered_in_1c"
        || delivery.payloadVersion !== 1
        || delivery.templateVersion !== 1) {
        throw new NotificationDeliveryError("invalid_payload", false);
      }
      const message = {
        ...renderOrderRegisteredInOneCEmail(delivery.payload, delivery.recipient),
        messageId: `<notification-${delivery.deliveryId}@nsd.md>`,
      };
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
