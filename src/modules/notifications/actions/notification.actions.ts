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
  NotificationSummary,
} from "../types";
import { createNotificationService } from "./service-factory";

export async function getNotificationSummaryAction(): Promise<ActionResult<NotificationSummary>> {
  try {
    return success(
      "Уведомления загружены.",
      await createNotificationService().getSummary(await getAuthenticatedUserId()),
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

export async function markAllNotificationsReadAction(): Promise<ActionResult<number>> {
  try {
    const affected = await createNotificationService().markAllRead(
      await getAuthenticatedUserId(),
    );
    revalidatePath("/cabinet/notifications");
    return success("Все уведомления прочитаны.", affected);
  } catch (error) {
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

