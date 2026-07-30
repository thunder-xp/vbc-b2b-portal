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
});

export class SupabaseNotificationHealthRepository
  implements NotificationHealthRepository
{
  async getHealth(): Promise<NotificationHealth> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_admin_notification_health");
    const parsed = healthSchema.safeParse(data);
    if (error || !parsed.success) throw new NotificationRepositoryError(error?.code);
    return parsed.data;
  }
}

