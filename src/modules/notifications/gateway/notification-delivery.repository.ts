import type { ClaimedNotificationDelivery } from "./types";

export type CompleteNotificationDeliveryInput = {
  deliveryId: string;
  leaseToken: string;
  succeeded: boolean;
  retryable: boolean;
  providerMessageId?: string | null;
  providerCode?: string | null;
  providerMessage?: string | null;
  providerTimestamp?: string | null;
  errorCategory?: string | null;
  durationMs: number;
};

export type CompleteNotificationDeliveryResult = {
  deliveryId: string;
  status: "sent" | "suppressed" | "failed" | "dead_letter" | "stale_claim";
  nextAttemptAt?: string | null;
};

export type NotificationRateLimitResult = Readonly<{
  deliveryId: string;
  outcome: "ALLOWED" | "RATE_LIMITED";
  recipientCount: number;
  companyCount: number;
  recipientLimit: number;
  companyLimit: number;
}>;

export interface NotificationDeliveryRepository {
  claim(batchSize: number, leaseSeconds: number): Promise<ClaimedNotificationDelivery[]>;
  claimSpecific(deliveryId: string, leaseSeconds: number): Promise<ClaimedNotificationDelivery | null>;
  reserveRateLimits(claims: ReadonlyArray<{ deliveryId: string; leaseToken: string }>): Promise<NotificationRateLimitResult[]>;
  completeBatch(
    inputs: CompleteNotificationDeliveryInput[],
  ): Promise<CompleteNotificationDeliveryResult[]>;
}
