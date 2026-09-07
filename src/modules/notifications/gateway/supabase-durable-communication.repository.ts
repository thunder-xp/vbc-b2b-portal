import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { CommunicationIntent, CommunicationProjection } from "./communication-intent";
import type {
  DurableCommunicationRecord,
  DurableCommunicationRepository,
} from "./durable-communication.repository";

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
    const { data, error } = await createAdminClient().rpc("persist_communication_intent", {
      p_intent: {
        intentId: intent.intentId,
        purpose: intent.purpose,
        businessEventType: intent.businessEventType,
        businessEntityReferences: intent.businessEntityReferences,
        companyId: intent.companyId,
        recipientUserId: intent.recipient.userId,
        businessIdentity: intent.idempotencyIdentity,
        correlationId: intent.correlationId,
        sensitivity: intent.sensitivity,
        scheduledBusinessDate: intent.scheduledBusinessDate,
      },
      p_deliveries: projections.map((projection) => ({
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
        adapterIdentity: projection.channel === "email" ? "smtp" : null,
        renderSnapshot: projection.rendered,
      })),
    });
    const parsed = persistedSchema.safeParse(data);
    if (error || !parsed.success) throw new DurableCommunicationRepositoryError(error?.code);
    return parsed.data;
  }
}

function normalizedRecipient(projection: CommunicationProjection): string {
  if (projection.channel === "email") return projection.recipient.email!.trim().toLowerCase();
  if (projection.channel === "sms" && projection.recipient.phone) {
    return projection.recipient.phone.replace(/[\s()-]/g, "");
  }
  return projection.recipient.userId;
}
