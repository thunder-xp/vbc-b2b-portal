import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  NotificationDeadlineRepository,
  NotificationDeadlineResult,
} from "./deadline.repository";

const resultSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["succeeded", "locked"]),
  businessDate: z.string().optional(),
  sourceEventsProcessed: z.number().int().nonnegative().optional(),
  recipientsResolved: z.number().int().nonnegative().optional(),
  notificationsCreated: z.number().int().nonnegative().optional(),
  deduplicated: z.number().int().nonnegative().optional(),
});

export class NotificationDeadlineRepositoryError extends Error {
  constructor(readonly safeCode?: string) {
    super("Notification deadline generation failed.");
    this.name = "NotificationDeadlineRepositoryError";
  }
}

export class SupabaseNotificationDeadlineRepository
  implements NotificationDeadlineRepository
{
  async generate(businessDate: string): Promise<NotificationDeadlineResult> {
    const { data, error } = await createAdminClient().rpc(
      "generate_partner_notification_deadlines",
      { p_business_date: businessDate },
    );
    const parsed = resultSchema.safeParse(data);
    if (error || !parsed.success) {
      throw new NotificationDeadlineRepositoryError(error?.code);
    }
    return parsed.data;
  }
}
