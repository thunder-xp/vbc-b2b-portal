import type { ClaimedNotificationDelivery } from "./types";

export type CompleteNotificationDeliveryInput = {
  deliveryId: string;
  leaseToken: string;
  succeeded: boolean;
  retryable: boolean;
  providerMessageId?: string | null;
  errorCategory?: string | null;
  durationMs: number;
};

export type CompleteNotificationDeliveryResult = {
  deliveryId: string;
  status: "sent" | "failed" | "dead_letter" | "stale_claim";
  nextAttemptAt?: string | null;
};

export interface NotificationDeliveryRepository {
  claim(batchSize: number, leaseSeconds: number): Promise<ClaimedNotificationDelivery[]>;
  completeBatch(
    inputs: CompleteNotificationDeliveryInput[],
  ): Promise<CompleteNotificationDeliveryResult[]>;
}
