import type {
  NotificationListFilter,
  NotificationPage,
  NotificationPreference,
  NotificationDeliveryMode,
  NotificationSummary,
} from "../types";

export interface NotificationRepository {
  getSummary(companyId: string, limit?: number): Promise<NotificationSummary>;
  list(companyId: string, filter: NotificationListFilter): Promise<NotificationPage>;
  markRead(companyId: string, notificationId: string): Promise<string>;
  markAllRead(companyId: string): Promise<number>;
  dismiss(companyId: string, notificationId: string): Promise<string>;
  getPreferences(companyId: string): Promise<NotificationPreference[]>;
  setPreference(
    companyId: string,
    eventGroup: NotificationPreference["eventGroup"],
    deliveryMode: NotificationDeliveryMode,
  ): Promise<void>;
}
