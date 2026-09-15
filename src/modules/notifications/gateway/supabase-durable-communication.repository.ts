import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { CommunicationIntent, CommunicationProjection } from "./communication-intent";
import type {
  DurableCommunicationRecord,
  DurableCommunicationRepository,
} from "./durable-communication.repository";
import { normalizeE164Phone } from "./sms-phone";
import { resolveSmsProviderIdentity } from "./sms-provider";

const persistedSchema = z.object({
  intentId: z.string(),
  eventId: z.string().uuid(),
  deliveries: z.array(z.object({
    deliveryId: z.string().uuid(),
    deliveryIdentity: z.string().regex(/^[0-9a-f]{64}$/),
    channel: z.enum(["email", "in_app", "sms"]),
    channelMode: z.enum(["DISABLED", "DRY_RUN", "SANDBOX", "LIVE"]),
    state: z.enum(["PROJECTED", "SUPPRESSED", "READY", "QUEUED"]),
  })),
});

export class DurableCommunicationRepositoryError extends Error {
  constructor(readonly safeCode?: string) {
    super("Durable communication persistence failed.");
    this.name = "DurableCommunicationRepositoryError";
  }
}

export class SupabaseDurableCommunicationRepository
implements DurableCommunicationRepository {
  async persist(
    intent: CommunicationIntent,
    projections: readonly CommunicationProjection[],
  ): Promise<DurableCommunicationRecord> {
    const customerScoped = intent.purpose === "CUSTOMER_SERVICE" && Boolean(intent.customerAccountId);
    const rpcName = customerScoped ? "persist_customer_service_sms_intent" : "persist_communication_intent";
    const { data, error } = await createAdminClient().rpc(rpcName, {
      p_intent: {
        intentId: intent.intentId,
        purpose: intent.purpose,
        businessEventType: intent.businessEventType,
        businessEntityReferences: intent.businessEntityReferences,
        companyId: intent.companyId,
        customerAccountId: intent.customerAccountId ?? null,
        recipientUserId: intent.recipient.userId,
        businessIdentity: intent.idempotencyIdentity,
        correlationId: intent.correlationId,
        sensitivity: intent.sensitivity,
        scheduledBusinessDate: intent.scheduledBusinessDate,
      },
      [customerScoped ? "p_delivery" : "p_deliveries"]: customerScoped ? deliveryPayload(projections[0]!) : projections.map(deliveryPayload),
    });
    const parsed = persistedSchema.safeParse(data);
    if (error || !parsed.success) throw new DurableCommunicationRepositoryError(error?.code);
    return parsed.data;
  }
}

function deliveryPayload(projection: CommunicationProjection) {
  return {
        deliveryIdentity: projection.deliveryIdentity,
        channel: projection.channel,
        channelMode: projection.mode,
        requestedMode: projection.requestedMode,
        effectiveMode: projection.effectiveMode,
        policyDecision: projection.policyDecision,
        preferenceOutcome: projection.preferenceOutcome,
        rateLimitOutcome: projection.rateLimitOutcome,
        sandboxOutcome: projection.sandboxOutcome,
        sandboxActualRecipient: projection.sandboxActualRecipient,
        originalRecipientFingerprint: projection.originalRecipientFingerprint,
        state: projection.state === "ACCEPTED" || (
          projection.policyDecision === "ALLOW"
          && (projection.mode === "LIVE" || projection.mode === "SANDBOX")
        )
          ? "READY"
          : projection.state,
        suppressionReason: projection.suppressionReason,
        recipient: normalizedRecipient(projection),
        recipientUserId: projection.recipient.userId,
        locale: projection.locale,
        templateKey: projection.templateKey,
        templateRevision: projection.templateVersion,
        adapterIdentity: projection.channel === "email" ? "smtp"
          : projection.channel === "sms" ? resolveSmsProviderIdentity(normalizedRecipient(projection)) : null,
        renderSnapshot: projection.rendered,
      customerAccountId: projection.customerAccountId,
    };
}

function normalizedRecipient(projection: CommunicationProjection): string {
  if (projection.channel === "email") return projection.recipient.email!.trim().toLowerCase();
  if (projection.channel === "sms" && projection.recipient.phone) {
    return normalizeE164Phone(projection.recipient.phone)!;
  }
  return projection.recipient.userId;
}
