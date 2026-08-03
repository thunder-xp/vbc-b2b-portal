import "server-only";

type NotificationMetric = {
  event: "notification_badge_loaded" | "notification_mark_all_started" |
    "notification_mark_all_completed" | "notification_mark_all_failed";
  durationMs?: number;
  affectedCount?: number;
  unreadCount?: number;
  correlationId?: string;
  safeErrorType?: string;
};

export function emitNotificationMetric(metric: NotificationMetric): void {
  console.info(JSON.stringify({
    ...metric,
    deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  }));
}
