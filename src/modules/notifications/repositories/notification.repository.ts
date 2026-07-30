import type {
  NotificationListFilter,
  NotificationPage,
  NotificationSummary,
} from "../types";

export interface NotificationRepository {
  getSummary(companyId: string, limit?: number): Promise<NotificationSummary>;
  list(companyId: string, filter: NotificationListFilter): Promise<NotificationPage>;
  markRead(companyId: string, notificationId: string): Promise<string>;
  markAllRead(companyId: string): Promise<number>;
  dismiss(companyId: string, notificationId: string): Promise<string>;
}

