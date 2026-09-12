import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  CompleteNotificationDeliveryInput,
  CompleteNotificationDeliveryResult,
  NotificationDeliveryRepository,
} from "./notification-delivery.repository";
import type { ClaimedNotificationDelivery } from "./types";

const claimedItemSchema = z.object({
  deliveryId: z.string().uuid(),
  eventId: z.string().uuid(),
  eventType: z.string(),
  companyId: z.string().uuid(),
  partnerOrderId: z.string().uuid().nullable(),
  correlationId: z.string(),
  payloadVersion: z.number().int().positive(),
  payload: z.unknown(),
  channel: z.enum(["email", "in_app", "sms", "telegram"]),
  channelMode: z.enum(["DISABLED", "DRY_RUN", "SANDBOX", "LIVE"]).optional(),
  purpose: z.enum(["TRANSACTIONAL", "FINANCE", "SECURITY", "SUPPORT", "MARKETING"]).optional(),
  policyDecision: z.enum(["ALLOW", "SUPPRESS"]).optional(),
  preferenceOutcome: z.enum(["ALLOWED", "SUPPRESSED", "NOT_APPLICABLE", "NOT_CONFIGURED"]).optional(),
  rateLimitOutcome: z.enum(["ALLOWED", "RATE_LIMITED", "NOT_EVALUATED"]).optional(),
  sandboxOutcome: z.enum(["NOT_APPLICABLE", "ALLOWED", "RECIPIENT_NOT_ALLOWED", "PROVIDER_UNAVAILABLE"]).optional(),
  recipient: z.string().min(3).max(320),
  recipientLocale: z.enum(["ru", "ro"]).optional(),
  templateKey: z.string().optional(),
  templateVersion: z.number().int().positive(),
  templateRevision: z.string().optional(),
  sensitivity: z.enum(["PUBLIC", "PARTNER_PRIVATE", "FINANCIAL_PRIVATE", "SECURITY_SENSITIVE"]).optional(),
  renderedSnapshot: z.unknown().optional(),
  attempt: z.number().int().min(1).max(3),
  attemptSequence: z.number().int().positive().optional(),
  attemptId: z.string().uuid().optional(),
  leaseToken: z.string().uuid(),
  idempotencyKey: z.string(),
});
const claimedSchema = z.array(claimedItemSchema);

const completionSchema = z.array(z.object({
  deliveryId: z.string().uuid(),
  status: z.enum(["sent", "suppressed", "failed", "dead_letter", "stale_claim"]),
  nextAttemptAt: z.string().nullable().optional(),
}));

const rateLimitSchema = z.object({
  deliveryId: z.string().uuid(),
  outcome: z.enum(["ALLOWED", "RATE_LIMITED"]),
  recipientCount: z.number().int().nonnegative(),
  companyCount: z.number().int().nonnegative(),
  recipientLimit: z.number().int().positive(),
  companyLimit: z.number().int().positive(),
});

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

  async claimSpecific(deliveryId: string, leaseSeconds: number): Promise<ClaimedNotificationDelivery | null> {
    const { data, error } = await createAdminClient().rpc(
      "claim_moldcell_sandbox_delivery",
      { p_delivery_id: deliveryId, p_lease_seconds: leaseSeconds },
    );
    const parsed = claimedItemSchema.nullable().safeParse(data);
    if (error || !parsed.success) throw new NotificationDeliveryRepositoryError(error?.code);
    return parsed.data;
  }

  async reserveRateLimits(claims: ReadonlyArray<{ deliveryId: string; leaseToken: string }>) {
    const { data, error } = await createAdminClient().rpc(
      "reserve_notification_delivery_rate_limits",
      { p_claims: claims.map((claim) => ({ deliveryId: claim.deliveryId, leaseToken: claim.leaseToken })) },
    );
    const parsed = z.array(rateLimitSchema).safeParse(data);
    if (error || !parsed.success) throw new NotificationDeliveryRepositoryError(error?.code);
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
