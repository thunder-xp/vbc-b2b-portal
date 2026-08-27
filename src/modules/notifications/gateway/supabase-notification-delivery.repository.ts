import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  CompleteNotificationDeliveryInput,
  CompleteNotificationDeliveryResult,
  NotificationDeliveryRepository,
} from "./notification-delivery.repository";
import type { ClaimedNotificationDelivery } from "./types";

const claimedSchema = z.array(z.object({
  deliveryId: z.string().uuid(),
  eventId: z.string().uuid(),
  eventType: z.string(),
  companyId: z.string().uuid(),
  partnerOrderId: z.string().uuid(),
  correlationId: z.string().uuid(),
  payloadVersion: z.number().int().positive(),
  payload: z.unknown(),
  channel: z.enum(["email", "sms", "telegram"]),
  recipient: z.string().email(),
  templateVersion: z.number().int().positive(),
  attempt: z.number().int().min(1).max(3),
  leaseToken: z.string().uuid(),
  idempotencyKey: z.string(),
}));

const completionSchema = z.array(z.object({
  deliveryId: z.string().uuid(),
  status: z.enum(["sent", "failed", "dead_letter", "stale_claim"]),
  nextAttemptAt: z.string().nullable().optional(),
}));

export class NotificationDeliveryRepositoryError extends Error {
  constructor(readonly safeCode?: string) {
    super("Notification delivery persistence failed.");
    this.name = "NotificationDeliveryRepositoryError";
  }
}

export class SupabaseNotificationDeliveryRepository
implements NotificationDeliveryRepository {
  async claim(batchSize: number, leaseSeconds: number): Promise<ClaimedNotificationDelivery[]> {
    const { data, error } = await createAdminClient().rpc(
      "claim_notification_deliveries",
      { p_batch_size: batchSize, p_lease_seconds: leaseSeconds },
    );
    const parsed = claimedSchema.safeParse(data);
    if (error || !parsed.success) {
      throw new NotificationDeliveryRepositoryError(error?.code);
    }
    return parsed.data;
  }

  async completeBatch(
    inputs: CompleteNotificationDeliveryInput[],
  ): Promise<CompleteNotificationDeliveryResult[]> {
    const { data, error } = await createAdminClient().rpc(
      "complete_notification_deliveries",
      { p_results: inputs },
    );
    const parsed = completionSchema.safeParse(data);
    if (error || !parsed.success) {
      throw new NotificationDeliveryRepositoryError(error?.code);
    }
    return parsed.data;
  }
}
