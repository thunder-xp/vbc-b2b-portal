export type NotificationChannel = "email" | "sms" | "telegram";

export type NotificationMessage = {
  recipient: string;
  subject: string;
  text: string;
  html: string;
  messageId?: string;
};

export type NotificationDeliveryResult = {
  providerMessageId: string | null;
};

export type NotificationDeliveryErrorCategory =
  | "configuration"
  | "timeout"
  | "authentication"
  | "rejected"
  | "unavailable"
  | "invalid_payload"
  | "unsupported_channel";

export class NotificationDeliveryError extends Error {
  constructor(
    readonly category: NotificationDeliveryErrorCategory,
    readonly retryable: boolean,
  ) {
    super("Notification delivery failed.");
    this.name = "NotificationDeliveryError";
  }
}

export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  send(message: NotificationMessage): Promise<NotificationDeliveryResult>;
}

export type ClaimedNotificationDelivery = {
  deliveryId: string;
  eventId: string;
  eventType: string;
  companyId: string;
  partnerOrderId: string;
  correlationId: string;
  payloadVersion: number;
  payload: unknown;
  channel: NotificationChannel;
  recipient: string;
  templateVersion: number;
  attempt: number;
  leaseToken: string;
  idempotencyKey: string;
};

export type NotificationWorkerResult = {
  claimed: number;
  sent: number;
  failed: number;
  deadLetter: number;
  durationMs: number;
  providerDurationMs: number;
};
