export type NotificationEventGroup = "orders" | "shipments" | "company_access";
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

