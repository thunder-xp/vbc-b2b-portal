"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminPermission } from "../../admin/services";
import { SupabaseNotificationHealthRepository } from "../repositories";
import type { NotificationHealth } from "../types";

export async function getNotificationHealthAction(): Promise<NotificationHealth> {
  await requireAdminPermission("admin.integrations.view");
  return new SupabaseNotificationHealthRepository().getHealth();
}

export async function retryNotificationDeliveryAction(formData: FormData): Promise<void> {
  await requireAdminPermission("admin.integrations.manage");
  const deliveryId = z.string().uuid().parse(formData.get("deliveryId"));
  await new SupabaseNotificationHealthRepository().retryDelivery(deliveryId);
  revalidatePath("/admin/integrations/notifications");
}

