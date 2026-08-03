import type { MarkAllNotificationsReadResult } from "../types";

export const NOTIFICATIONS_MARKED_ALL_READ_EVENT = "partner:notifications-marked-all-read";

export function notifyAllNotificationsRead(result: MarkAllNotificationsReadResult): void {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_MARKED_ALL_READ_EVENT, { detail: result }));
}
