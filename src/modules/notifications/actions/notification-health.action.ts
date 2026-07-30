"use server";

import { requireAdminPermission } from "../../admin/services";
import { SupabaseNotificationHealthRepository } from "../repositories";
import type { NotificationHealth } from "../types";

export async function getNotificationHealthAction(): Promise<NotificationHealth> {
  await requireAdminPermission("admin.integrations.view");
  return new SupabaseNotificationHealthRepository().getHealth();
}

