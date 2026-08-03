"use server";

import { revalidatePath } from "next/cache";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type {
  NotificationListFilter,
  NotificationPage,
  NotificationPreference,
  NotificationDeliveryMode,
  NotificationSummary,
  MarkAllNotificationsReadResult,
} from "../types";
import { createNotificationService } from "./service-factory";
import { emitNotificationMetric } from "./notification-observability";

export async function getNotificationSummaryAction(): Promise<ActionResult<NotificationSummary>> {
  const startedAt = performance.now();
  try {
    const result = await createNotificationService().getSummary(await getAuthenticatedUserId());
    emitNotificationMetric({
      event: "notification_badge_loaded",
      durationMs: performance.now() - startedAt,
      unreadCount: result.unreadCount,
    });
    return success(
      "Уведомления загружены.",
      result,
    );
  } catch (error) {
    return failureFromError(error);
  }
}

export async function listNotificationsAction(
  filter: NotificationListFilter,
): Promise<ActionResult<NotificationPage>> {
  try {
    return success(
      "Уведомления загружены.",
      await createNotificationService().list(await getAuthenticatedUserId(), filter),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

export async function markNotificationReadAction(
  notificationId: string,
): Promise<ActionResult<string>> {
  try {
    const markedAt = await createNotificationService().markRead(
      await getAuthenticatedUserId(),
      notificationId,
    );
    revalidatePath("/cabinet/notifications");
    return success("Уведомление прочитано.", markedAt);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function markAllNotificationsReadAction(): Promise<
  ActionResult<MarkAllNotificationsReadResult>
> {
  const startedAt = performance.now();
  emitNotificationMetric({ event: "notification_mark_all_started" });
  try {
    const affected = await createNotificationService().markAllRead(
      await getAuthenticatedUserId(),
    );
    revalidatePath("/cabinet/notifications");
    emitNotificationMetric({
      event: "notification_mark_all_completed",
      durationMs: performance.now() - startedAt,
      affectedCount: affected.affectedCount,
      unreadCount: affected.unreadCount,
      correlationId: affected.correlationId,
    });
    return success("Все уведомления прочитаны.", affected);
  } catch (error) {
    emitNotificationMetric({
      event: "notification_mark_all_failed",
      durationMs: performance.now() - startedAt,
      safeErrorType: error instanceof Error ? error.name : "unknown",
    });
    return failureFromError(error);
  }
}

export async function dismissNotificationAction(
  notificationId: string,
): Promise<ActionResult<string>> {
  try {
    const dismissedAt = await createNotificationService().dismiss(
      await getAuthenticatedUserId(),
      notificationId,
    );
    revalidatePath("/cabinet/notifications");
    return success("Уведомление скрыто.", dismissedAt);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getNotificationPreferencesAction(): Promise<
  ActionResult<NotificationPreference[]>
> {
  try {
    return success(
      "Настройки загружены.",
      await createNotificationService().getPreferences(await getAuthenticatedUserId()),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

export async function setNotificationPreferenceAction(
  eventGroup: NotificationPreference["eventGroup"],
  deliveryMode: NotificationDeliveryMode,
): Promise<ActionResult<null>> {
  try {
    await createNotificationService().setPreference(
      await getAuthenticatedUserId(),
      eventGroup,
      deliveryMode,
    );
    revalidatePath("/cabinet/notifications/settings");
    return success("Настройки сохранены.", null);
  } catch (error) {
    return failureFromError(error);
  }
}
