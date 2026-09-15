import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import { SupabaseDurableCommunicationRepository } from "../gateway/supabase-durable-communication.repository";
import type { CommunicationIntent, CommunicationProjection } from "../gateway/communication-intent";

describe("SupabaseDurableCommunicationRepository", () => {
  it("omits an absent render snapshot for safely suppressed customer SMS", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        intentId: "customer-service-sms:11111111-1111-4111-8111-111111111111",
        eventId: "22222222-2222-4222-8222-222222222222",
        deliveries: [{
          deliveryId: "33333333-3333-4333-8333-333333333333",
          deliveryIdentity: "a".repeat(64),
          channel: "sms",
          channelMode: "SANDBOX",
          state: "SUPPRESSED",
        }],
      },
      error: null,
    });

    const intent = {
      intentId: "customer-service-sms:11111111-1111-4111-8111-111111111111",
      purpose: "CUSTOMER_SERVICE",
      customerAccountId: "44444444-4444-4444-8444-444444444444",
      recipient: { userId: "55555555-5555-4555-8555-555555555555" },
    } as CommunicationIntent;
    const projection = {
      deliveryIdentity: "a".repeat(64),
      channel: "sms",
      mode: "SANDBOX",
      requestedMode: "SANDBOX",
      effectiveMode: "DISABLED",
      policyDecision: "SUPPRESS",
      preferenceOutcome: "NOT_APPLICABLE",
      rateLimitOutcome: "NOT_EVALUATED",
      sandboxOutcome: "RECIPIENT_NOT_ALLOWED",
      sandboxActualRecipient: "+37369000000",
      originalRecipientFingerprint: "b".repeat(64),
      state: "SUPPRESSED",
      suppressionReason: "SANDBOX_RECIPIENT_NOT_ALLOWED",
      recipient: {
        userId: "55555555-5555-4555-8555-555555555555",
        phone: "+37369000000",
      },
      locale: "ru",
      templateKey: "customer_service.need_info_sms",
      templateVersion: "v1",
      rendered: null,
      customerAccountId: "44444444-4444-4444-8444-444444444444",
    } as CommunicationProjection;

    await new SupabaseDurableCommunicationRepository().persist(intent, [projection]);

    const payload = rpc.mock.calls[0]?.[1] as { p_delivery: Record<string, unknown> };
    expect(payload.p_delivery.renderSnapshot).toBeUndefined();
    expect(JSON.stringify(payload.p_delivery)).not.toContain("renderSnapshot");
  });
});
