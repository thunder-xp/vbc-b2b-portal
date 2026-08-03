import "server-only";

import { z } from "zod";

import { createClient } from "@/src/lib/supabase/server";

import type { NotificationRepository } from "./notification.repository";
import type {
  NotificationListFilter,
  NotificationPage,
  NotificationPreference,
  NotificationDeliveryMode,
  NotificationSummary,
  MarkAllNotificationsReadResult,
} from "../types";

const itemSchema = z.object({
  id: z.string().uuid(),
  eventCode: z.string().min(1),
  eventGroup: z.enum(["orders", "shipments", "company_access", "products", "commercial", "documents", "service"]),
  severity: z.enum(["critical", "warning", "information", "success"]),
  mandatory: z.boolean(),
  title: z.string(),
  message: z.string(),
  actionLabel: z.string().nullable(),
  actionUrl: z.string().nullable(),
  occurredAt: z.string(),
  readAt: z.string().nullable(),
  dismissedAt: z.string().nullable(),
  expiresAt: z.string(),
});

const summarySchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  items: z.array(itemSchema),
});
const pageSchema = z.object({
  items: z.array(itemSchema),
  nextCursor: z.object({
    occurredAt: z.string(),
    id: z.string().uuid(),
  }).nullable(),
});
const preferencesSchema = z.array(z.object({
  eventGroup: z.enum(["orders", "shipments", "company_access", "products", "commercial", "documents", "service"]),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  deliveryMode: z.enum(["immediate", "daily", "off"]),
}));
const markAllReadSchema = z.object({
  affectedCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  correlationId: z.string().uuid(),
  markedAt: z.string(),
});

export class NotificationRepositoryError extends Error {
  constructor(readonly safeCode?: string) {
    super("Notification data is unavailable.");
    this.name = "NotificationRepositoryError";
  }
}

export class SupabaseNotificationRepository implements NotificationRepository {
  async getSummary(companyId: string, limit = 8): Promise<NotificationSummary> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_partner_notification_summary", {
      p_company_id: companyId,
      p_limit: limit,
    });
    const parsed = summarySchema.safeParse(data);
    if (error || !parsed.success) throw new NotificationRepositoryError(error?.code);
    return { ...parsed.data, items: parsed.data.items.map(withEmptyRelativeTime) };
  }

  async list(companyId: string, filter: NotificationListFilter): Promise<NotificationPage> {
    const client = await createClient();
    const { data, error } = await client.rpc("list_partner_notifications", {
      p_company_id: companyId,
      p_event_group: filter.eventGroup ?? null,
      p_unread_only: filter.unreadOnly ?? false,
      p_cursor_occurred_at: filter.cursor?.occurredAt ?? null,
      p_cursor_id: filter.cursor?.id ?? null,
      p_page_size: filter.pageSize ?? 20,
    });
    const parsed = pageSchema.safeParse(data);
    if (error || !parsed.success) throw new NotificationRepositoryError(error?.code);
    return { ...parsed.data, items: parsed.data.items.map(withEmptyRelativeTime) };
  }

  async markRead(companyId: string, notificationId: string): Promise<string> {
    return this.mutateTimestamp("mark_partner_notification_read", {
      p_company_id: companyId,
      p_notification_id: notificationId,
    });
  }

  async markAllRead(companyId: string): Promise<MarkAllNotificationsReadResult> {
    const client = await createClient();
    const { data, error } = await client.rpc("mark_all_partner_notifications_read_v2", {
      p_company_id: companyId,
    });
    const parsed = markAllReadSchema.safeParse(data);
    if (error || !parsed.success) throw new NotificationRepositoryError(error?.code);
    return parsed.data;
  }

  async dismiss(companyId: string, notificationId: string): Promise<string> {
    return this.mutateTimestamp("dismiss_partner_notification", {
      p_company_id: companyId,
      p_notification_id: notificationId,
    });
  }

  async getPreferences(companyId: string): Promise<NotificationPreference[]> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_partner_notification_preferences", {
      p_company_id: companyId,
    });
    const parsed = preferencesSchema.safeParse(data);
    if (error || !parsed.success) throw new NotificationRepositoryError(error?.code);
    return parsed.data;
  }

  async setPreference(
    companyId: string,
    eventGroup: NotificationPreference["eventGroup"],
    deliveryMode: NotificationDeliveryMode,
  ): Promise<void> {
    const client = await createClient();
    const { error } = await client.rpc("set_partner_notification_preference", {
      p_company_id: companyId,
      p_event_group: eventGroup,
      p_in_app_enabled: !["products", "documents"].includes(eventGroup) || deliveryMode !== "off",
      p_email_enabled: false,
      p_delivery_mode: deliveryMode,
    });
    if (error) throw new NotificationRepositoryError(error.code);
  }

  private async mutateTimestamp(
    rpc: "mark_partner_notification_read" | "dismiss_partner_notification",
    input: { p_company_id: string; p_notification_id: string },
  ): Promise<string> {
    const client = await createClient();
    const { data, error } = await client.rpc(rpc, input);
    if (error || typeof data !== "string") throw new NotificationRepositoryError(error?.code);
    return data;
  }
}

function withEmptyRelativeTime(item: z.infer<typeof itemSchema>) {
  return { ...item, relativeTime: "" };
}
