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
    recentDeliveries: Array<{
      deliveryId: string | null;
      eventId: string;
      eventType: string;
      companyId: string;
      companyName: string;
      partnerOrderId: string;
      orderNumber: string | null;
      channel: "email" | "sms" | "telegram";
      recipient: string;
      status: "queued" | "processing" | "sent" | "failed" | "dead_letter";
      attempts: number;
      sentAt: string | null;
      safeError: string | null;
      correlationId: string;
      createdAt: string;
    }>;
  };
};
