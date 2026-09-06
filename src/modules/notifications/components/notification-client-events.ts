import type { MarkAllNotificationsReadResult } from "../types";

export const NOTIFICATIONS_MARKED_ALL_READ_EVENT = "partner:notifications-marked-all-read";
export const NOTIFICATION_DISMISSED_EVENT = "partner:notification-dismissed";

export function notifyAllNotificationsRead(result: MarkAllNotificationsReadResult): void {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_MARKED_ALL_READ_EVENT, { detail: result }));
}

export function notifyNotificationDismissed(notificationId: string): void {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_DISMISSED_EVENT, { detail: { notificationId } }));
}
