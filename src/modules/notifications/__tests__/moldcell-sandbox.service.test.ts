import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MoldcellSandboxService,
  type ClaimedNotificationDelivery,
  type DurableCommunicationRepository,
  type MoldcellSmsHealthRepository,
  type NotificationChannelAdapter,
  type NotificationDeliveryRepository,
} from "../gateway";

const companyId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const operatorId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const deliveryId = "55555555-5555-4555-8555-555555555555";
const attemptId = "66666666-6666-4666-8666-666666666666";
const leaseToken = "77777777-7777-4777-8777-777777777777";

describe("MoldcellSandboxService", () => {
  it("persists one governed SUPPORT intent and sends through the common worker", async () => {
    const dependencies = makeDependencies();
    const result = await dependencies.service.sendSandbox({
      operatorUserId: operatorId,
      recipientToken: token("+37369000000"),
      message: "hello",
    });

    expect(dependencies.durable.persist).toHaveBeenCalledOnce();
    const [intent, projections] = dependencies.durable.persist.mock.calls[0]!;
    expect(intent).toMatchObject({
      purpose: "SUPPORT",
      businessEventType: "support.sms_sandbox_test",
      companyId,
      recipient: { userId, companyId, phone: "+37369000000" },
      channelPolicy: { sms: "SANDBOX" },
    });
    expect(projections).toEqual([expect.objectContaining({
      channel: "sms", mode: "SANDBOX", state: "PROJECTED", rendered: expect.objectContaining({
        textBody: "NSD TEST: hello",
      }),
    })]);
    expect(dependencies.delivery.claimSpecific).toHaveBeenCalledWith(deliveryId, 90);
    expect(dependencies.provider.send).toHaveBeenCalledOnce();
    expect(dependencies.delivery.completeBatch).toHaveBeenCalledWith([expect.objectContaining({
      deliveryId, leaseToken, succeeded: true, providerCode: "0",
    })]);
    expect(result).toMatchObject({
      deliveryId, attemptId, normalizedPhone: "+373*****000", providerStatus: "PROVIDER_ACCEPTED",
    });
  });

  it("rejects arbitrary recipient tokens before persistence", async () => {
    const dependencies = makeDependencies();
    await expect(dependencies.service.sendSandbox({
      operatorUserId: operatorId,
      recipientToken: token("+37368000000"),
      message: "hello",
    })).rejects.toMatchObject({ safeCode: "SANDBOX_RECIPIENT_NOT_ALLOWED" });
    expect(dependencies.durable.persist).not.toHaveBeenCalled();
    expect(dependencies.provider.send).not.toHaveBeenCalled();
  });

  it("fails closed unless mode, kill switch, identity and provider configuration are complete", async () => {
    const dependencies = makeDependencies({ SMS_MODE: "DISABLED" });
    await expect(dependencies.service.sendSandbox({
      operatorUserId: operatorId,
      recipientToken: token("+37369000000"),
      message: "hello",
    })).rejects.toMatchObject({ safeCode: "SMS_SANDBOX_DISABLED" });
    expect(dependencies.durable.persist).not.toHaveBeenCalled();
  });

  it("reports only masked allowlisted numbers and safe aggregate health", async () => {
    const dependencies = makeDependencies();
    const readiness = await dependencies.service.getReadiness();
    expect(readiness).toMatchObject({
      smsMode: "SANDBOX",
      identityConfigured: true,
      allowedRecipients: [{ token: token("+37369000000"), maskedPhone: "+373*****000" }],
      stored: { acceptedCount: 0, recipientLimitPerHour: 1, companyLimitPerHour: 5 },
    });
    expect(JSON.stringify(readiness)).not.toContain("+37369000000");
  });

  it("does not make a second provider call when the durable identity is already consumed", async () => {
    const dependencies = makeDependencies();
    dependencies.delivery.claimSpecific
      .mockResolvedValueOnce(dependencies.claimed)
      .mockResolvedValueOnce(null);
    const input = { operatorUserId: operatorId, recipientToken: token("+37369000000"), message: "hello" };
    await dependencies.service.sendSandbox(input);
    await expect(dependencies.service.sendSandbox(input)).rejects.toMatchObject({
      safeCode: "SANDBOX_DELIVERY_NOT_CLAIMED",
    });
    expect(dependencies.provider.send).toHaveBeenCalledOnce();
  });
});

function makeDependencies(overrides: Record<string, string> = {}) {
  const environment = {
    SMS_MODE: "SANDBOX",
    COMMUNICATION_SMS_KILL_SWITCH: "OFF",
    COMMUNICATION_SANDBOX_SMS_ALLOWLIST: "+37369000000",
    COMMUNICATION_SMS_SANDBOX_COMPANY_ID: companyId,
    COMMUNICATION_SMS_SANDBOX_USER_ID: userId,
    MOLDCELL_TRANSPORT_MODE: "relay",
    MOLDCELL_RELAY_URL: "https://relay.example.com/internal/omnichannel/v1/sms/moldcell",
    MOLDCELL_RELAY_KEY_ID: "key-1",
    MOLDCELL_RELAY_AUTH_SECRET: "not-a-real-secret-at-least-32-characters",
    ...overrides,
  };
  const durable = {
    persist: vi.fn<DurableCommunicationRepository["persist"]>().mockResolvedValue({
      intentId: "intent", eventId, deliveries: [{
        deliveryId, deliveryIdentity: "a".repeat(64), channel: "sms", channelMode: "SANDBOX", state: "READY",
      }],
    }),
  };
  const claimed: ClaimedNotificationDelivery = {
    deliveryId, eventId, eventType: "support.sms_sandbox_test", companyId,
    partnerOrderId: null, correlationId: "correlation", payloadVersion: 1, payload: {},
    channel: "sms", channelMode: "SANDBOX", purpose: "SUPPORT", policyDecision: "ALLOW",
    preferenceOutcome: "NOT_APPLICABLE", rateLimitOutcome: "NOT_EVALUATED", sandboxOutcome: "ALLOWED",
    recipient: "+37369000000", recipientLocale: "ru", templateKey: "moldcell.sms_sandbox_test",
    templateVersion: 1, templateRevision: "v1", sensitivity: "SECURITY_SENSITIVE",
    renderedSnapshot: { subject: "Moldcell sandbox test", textBody: "NSD TEST: hello" },
    attempt: 1, attemptSequence: 1, attemptId, leaseToken, idempotencyKey: "delivery-key",
  };
  const delivery = {
    claim: vi.fn<NotificationDeliveryRepository["claim"]>().mockResolvedValue([]),
    claimSpecific: vi.fn<NotificationDeliveryRepository["claimSpecific"]>().mockResolvedValue(claimed),
    reserveRateLimits: vi.fn<NotificationDeliveryRepository["reserveRateLimits"]>().mockResolvedValue([{
      deliveryId, outcome: "ALLOWED", recipientCount: 1, companyCount: 1, recipientLimit: 1, companyLimit: 5,
    }]),
    completeBatch: vi.fn<NotificationDeliveryRepository["completeBatch"]>().mockResolvedValue([{ deliveryId, status: "sent" }]),
  };
  const provider = {
    channel: "sms" as const,
    send: vi.fn<NotificationChannelAdapter["send"]>().mockResolvedValue({
      provider: "moldcell", providerMessageId: null, providerStatus: "PROVIDER_ACCEPTED",
      providerCode: "0", providerTimestamp: "12.09.2026 20:55:38", providerMessage: "",
    }),
  };
  const health = {
    getHealth: vi.fn<MoldcellSmsHealthRepository["getHealth"]>().mockResolvedValue({
      lastSandboxSuccess: null, lastFailure: null, p50LatencyMs: null, p95LatencyMs: null,
      acceptedCount: 0, failedCount: 0, retryCount: 0, recipientLimitPerHour: 1, companyLimitPerHour: 5,
    }),
  };
  return {
    durable, delivery, provider, claimed,
    service: new MoldcellSandboxService(durable, delivery, health, environment, () => provider),
  };
}

function token(phone: string): string {
  return createHash("sha256").update(phone).digest("hex");
}
