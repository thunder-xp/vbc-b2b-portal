import type { PartnerNotificationGroup } from "./domain/event-catalog";

export type NotificationEventGroup = PartnerNotificationGroup;
export type NotificationSeverity = "critical" | "warning" | "information" | "success";

export type PartnerNotification = {
  id: string;
  eventCode: string;
  eventGroup: NotificationEventGroup;
  severity: NotificationSeverity;
  mandatory: boolean;
  title: string;
  message: string;
  actionLabel: string | null;
  actionUrl: string | null;
  occurredAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  expiresAt: string;
  relativeTime: string;
};

export type NotificationSummary = {
  unreadCount: number;
  items: PartnerNotification[];
};

export type MarkAllNotificationsReadResult = {
  affectedCount: number;
  unreadCount: number;
  correlationId: string;
  markedAt: string;
};

export type NotificationCursor = {
  occurredAt: string;
  id: string;
};

export type NotificationPage = {
  items: PartnerNotification[];
  nextCursor: NotificationCursor | null;
};

export type NotificationListFilter = {
  eventGroup?: NotificationEventGroup;
  unreadOnly?: boolean;
  cursor?: NotificationCursor;
  pageSize?: number;
};

export type NotificationDeliveryMode = "immediate" | "daily" | "off";

export type NotificationPreference = {
  eventGroup: NotificationEventGroup;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  deliveryMode: NotificationDeliveryMode;
};

export type NotificationHealth = {
  generated: number;
  unread: number;
  deduplicated: number;
  recentFailures: Array<{
    runId: string;
    worker: string;
    safeErrorCode: string | null;
    startedAt: string;
    finishedAt: string | null;
  }>;
  lastShipmentWorkerRun: null | {
    runId: string;
    status: string;
    businessDate: string;
    sourceEventsProcessed: number;
    notificationsCreated: number;
    deduplicated: number;
    durationMs: number | null;
    startedAt: string;
    finishedAt: string | null;
  };
  productTransitionsCaptured: number;
  productWatcherRecipientsResolved: number;
  productNotificationsCreated: number;
  productDeduplicated: number;
  productSuppressed: number;
  productFailedProjections: number;
  lastProcessedProductSyncIds: string[];
  oldestUnprocessedProductTransition: string | null;
  lastProductProjectionRun: null | {
    runId: string;
    status: string;
    sourceSyncId: string | null;
    transitionsProcessed: number;
    watcherRecipientsResolved: number;
    notificationsCreated: number;
    deduplicated: number;
    suppressed: number;
    failedProjections: number;
    durationMs: number | null;
    startedAt: string;
    finishedAt: string | null;
  };
  cronRoutes: Array<{
    route: string;
    lastInvokedAt: string;
    lastAuthorizedAt: string | null;
    lastDeniedAt: string | null;
    lastAuthCategory: string;
    lastCallerType: string;
    lastDeploymentSha: string | null;
    authorizedCount: number;
    deniedCount: number;
  }>;
  gateway: {
    queued: number;
    processing: number;
    sentLast24Hours: number;
    failed: number;
    deadLetter: number;
    stateCounts: {
      projected: number;
      suppressed: number;
      ready: number;
      queued: number;
      processing: number;
      accepted: number;
      failedRetryable: number;
      failedFinal: number;
      cancelled: number;
    };
    rateLimits: {
      recipientPerHour: number;
      companyPurposeChannelPerHour: number;
      workerBatchDefault: number;
      workerBatchMaximum: number;
      allowedLast24Hours: number;
      limitedLast24Hours: number;
    };
    governanceCounts: Array<{
      purpose: string;
      channel: "email" | "in_app" | "sms" | "telegram";
      decision: "ALLOW" | "SUPPRESS";
      reason: string;
      count: number;
    }>;
    byCommunicationTypeChannel: Array<{
      eventType: string;
      purpose: string;
      channel: "email" | "in_app" | "sms" | "telegram";
      mode: "DISABLED" | "DRY_RUN" | "SANDBOX" | "LIVE";
      state: "PROJECTED" | "SUPPRESSED" | "READY" | "QUEUED" | "PROCESSING" | "ACCEPTED" | "FAILED_RETRYABLE" | "FAILED_FINAL" | "CANCELLED";
      count: number;
    }>;
    recentDeliveries: Array<{
      deliveryId: string | null;
      eventId: string;
      eventType: string;
      purpose: string;
      companyId: string;
      companyName: string;
      partnerOrderId: string | null;
      orderNumber: string | null;
      channel: "email" | "in_app" | "sms" | "telegram";
      mode: "DISABLED" | "DRY_RUN" | "SANDBOX" | "LIVE";
      requestedMode: "DISABLED" | "DRY_RUN" | "SANDBOX" | "LIVE";
      effectiveMode: "DISABLED" | "DRY_RUN" | "SANDBOX" | "LIVE";
      policyDecision: "ALLOW" | "SUPPRESS";
      preferenceResult: "ALLOWED" | "SUPPRESSED" | "NOT_APPLICABLE" | "NOT_CONFIGURED";
      rateLimitResult: "ALLOWED" | "RATE_LIMITED" | "NOT_EVALUATED";
      sandboxResult: "NOT_APPLICABLE" | "ALLOWED" | "RECIPIENT_NOT_ALLOWED" | "PROVIDER_UNAVAILABLE";
      recipient: string;
      status: "projected" | "suppressed" | "queued" | "processing" | "sent" | "failed" | "dead_letter";
      state: "PROJECTED" | "SUPPRESSED" | "READY" | "QUEUED" | "PROCESSING" | "ACCEPTED" | "FAILED_RETRYABLE" | "FAILED_FINAL" | "CANCELLED";
      attempts: number;
      sentAt: string | null;
      attemptedAt: string | null;
      safeError: string | null;
      correlationId: string;
      templateKey: string;
      templateVersion: string;
      createdAt: string;
    }>;
  };
};
