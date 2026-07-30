import "server-only";

import { z } from "zod";

import { createClient } from "@/src/lib/supabase/server";

import type { NotificationHealthRepository } from "./notification-health.repository";
import type { NotificationHealth } from "../types";
import { NotificationRepositoryError } from "./supabase-notification.repository";

const healthSchema = z.object({
  generated: z.number().int().nonnegative(),
  unread: z.number().int().nonnegative(),
  deduplicated: z.number().int().nonnegative(),
  recentFailures: z.array(z.object({
    runId: z.string().uuid(),
    worker: z.string(),
    safeErrorCode: z.string().nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
  })),
  lastShipmentWorkerRun: z.object({
    runId: z.string().uuid(),
    status: z.string(),
    businessDate: z.string(),
    sourceEventsProcessed: z.number().int().nonnegative(),
    notificationsCreated: z.number().int().nonnegative(),
    deduplicated: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative().nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
  }).nullable(),
  productTransitionsCaptured: z.number().int().nonnegative(),
  productWatcherRecipientsResolved: z.number().int().nonnegative(),
  productNotificationsCreated: z.number().int().nonnegative(),
  productDeduplicated: z.number().int().nonnegative(),
  productSuppressed: z.number().int().nonnegative(),
  productFailedProjections: z.number().int().nonnegative(),
  lastProcessedProductSyncIds: z.array(z.string().uuid()),
  oldestUnprocessedProductTransition: z.string().nullable(),
  lastProductProjectionRun: z.object({
    runId: z.string().uuid(),
    status: z.string(),
    sourceSyncId: z.string().uuid().nullable(),
    transitionsProcessed: z.number().int().nonnegative(),
    watcherRecipientsResolved: z.number().int().nonnegative(),
    notificationsCreated: z.number().int().nonnegative(),
    deduplicated: z.number().int().nonnegative(),
    suppressed: z.number().int().nonnegative(),
    failedProjections: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative().nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
  }).nullable(),
  cronRoutes: z.array(z.object({
    route: z.string(),
    lastInvokedAt: z.string(),
    lastAuthorizedAt: z.string().nullable(),
    lastDeniedAt: z.string().nullable(),
    lastAuthCategory: z.string(),
    lastCallerType: z.string(),
    lastDeploymentSha: z.string().nullable(),
    authorizedCount: z.number().int().nonnegative(),
    deniedCount: z.number().int().nonnegative(),
  })),
});

export class SupabaseNotificationHealthRepository
  implements NotificationHealthRepository
{
  async getHealth(): Promise<NotificationHealth> {
    const client = await createClient();
    const [notificationResult, cronResult] = await Promise.all([
      client.rpc("get_admin_notification_health"),
      client.rpc("get_admin_cron_route_health"),
    ]);
    const parsed = healthSchema.safeParse({
      ...notificationResult.data,
      cronRoutes: cronResult.data,
    });
    if (notificationResult.error || cronResult.error || !parsed.success) {
      throw new NotificationRepositoryError(
        notificationResult.error?.code ?? cronResult.error?.code,
      );
    }
    return parsed.data;
  }
}
