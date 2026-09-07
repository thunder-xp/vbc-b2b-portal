export type NotificationChannel = "email" | "in_app" | "sms" | "telegram";

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
  | "global_kill_switch"
  | "channel_kill_switch"
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
  partnerOrderId: string | null;
  correlationId: string;
  payloadVersion: number;
  payload: unknown;
  channel: NotificationChannel;
  channelMode?: "DISABLED" | "DRY_RUN" | "SANDBOX" | "LIVE";
  purpose?: "TRANSACTIONAL" | "FINANCE" | "SECURITY" | "SUPPORT" | "MARKETING";
  policyDecision?: "ALLOW" | "SUPPRESS";
  preferenceOutcome?: "ALLOWED" | "SUPPRESSED" | "NOT_APPLICABLE" | "NOT_CONFIGURED";
  rateLimitOutcome?: "ALLOWED" | "RATE_LIMITED" | "NOT_EVALUATED";
  sandboxOutcome?: "NOT_APPLICABLE" | "ALLOWED" | "RECIPIENT_NOT_ALLOWED" | "PROVIDER_UNAVAILABLE";
  recipient: string;
  recipientLocale?: "ru" | "ro";
  templateKey?: string;
  templateVersion: number;
  templateRevision?: string;
  sensitivity?: "PUBLIC" | "PARTNER_PRIVATE" | "FINANCIAL_PRIVATE" | "SECURITY_SENSITIVE";
  renderedSnapshot?: unknown;
  attempt: number;
  attemptSequence?: number;
  leaseToken: string;
  idempotencyKey: string;
};

export type NotificationWorkerResult = {
  claimed: number;
  sent: number;
  suppressed: number;
  failed: number;
  deadLetter: number;
  durationMs: number;
  providerDurationMs: number;
};
