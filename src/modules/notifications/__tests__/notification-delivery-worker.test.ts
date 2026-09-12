import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CompleteNotificationDeliveryInput,
  CompleteNotificationDeliveryResult,
  NotificationDeliveryRepository,
} from "../gateway/notification-delivery.repository";
import {
  NotificationDeliveryError,
  NotificationDeliveryWorkerService,
  communicationActivationPolicyFromEnvironment,
  type ClaimedNotificationDelivery,
  type NotificationChannelAdapter,
} from "../gateway";

describe("NotificationDeliveryWorkerService", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not claim or call a provider while the global kill switch is on", async () => {
    vi.stubEnv("COMMUNICATION_OUTBOUND_KILL_SWITCH", "ON");
    const dependencies = makeDependencies();
    await expect(dependencies.worker.run()).resolves.toMatchObject({ claimed: 0, sent: 0, failed: 0, deadLetter: 0 });
    expect(dependencies.repository.claim).not.toHaveBeenCalled();
    expect(dependencies.adapter.send).not.toHaveBeenCalled();
  });

  it("rechecks the kill switch after claim and immediately before SMTP invocation", async () => {
    const dependencies = makeDependencies();
    dependencies.repository.claim.mockImplementationOnce(async () => {
      vi.stubEnv("COMMUNICATION_EMAIL_KILL_SWITCH", "ON");
      return [delivery];
    });
    dependencies.repository.completeBatch.mockResolvedValue([completion("suppressed")]);

    await expect(dependencies.worker.run()).resolves.toMatchObject({ claimed: 1, suppressed: 1, failed: 0 });
    expect(dependencies.adapter.send).not.toHaveBeenCalled();
    expect(dependencies.repository.completeBatch).toHaveBeenCalledWith([
      expect.objectContaining({ retryable: false, errorCategory: "CHANNEL_KILL_SWITCH" }),
    ]);
  });

  it("delivers one claimed event and records provider timing", async () => {
    const dependencies = makeDependencies();
    const result = await dependencies.worker.run();
    expect(result).toMatchObject({ claimed: 1, sent: 1, failed: 0, deadLetter: 0 });
    expect(dependencies.adapter.send).toHaveBeenCalledOnce();
    expect(dependencies.adapter.send).toHaveBeenCalledWith(expect.objectContaining({
      messageId: `<notification-${delivery.deliveryId}@nsd.md>`,
      subject: "Comanda NSUU-1 a fost confirmată — expediere 30 august",
    }));
    expect(dependencies.repository.completeBatch).toHaveBeenCalledWith([expect.objectContaining({
      deliveryId: delivery.deliveryId,
      leaseToken: delivery.leaseToken,
      succeeded: true,
      retryable: false,
    })]);
    const logs = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logs).not.toContain("buyer@example.com");
    expect(logs).not.toContain("paymentCalendar");
    expect(logs).not.toContain("orderTotal");
  });

  it("persists transient failures for bounded retry without throwing", async () => {
    const dependencies = makeDependencies();
    dependencies.adapter.send.mockRejectedValue(new NotificationDeliveryError("timeout", true));
    dependencies.repository.completeBatch.mockResolvedValue([completion("failed")]);
    const result = await dependencies.worker.run();
    expect(result.failed).toBe(1);
    expect(dependencies.repository.completeBatch).toHaveBeenCalledWith([expect.objectContaining({
      succeeded: false,
      retryable: true,
      errorCategory: "timeout",
    })]);
  });

  it("dead-letters permanent provider failures", async () => {
    const dependencies = makeDependencies();
    dependencies.adapter.send.mockRejectedValue(new NotificationDeliveryError("rejected", false));
    dependencies.repository.completeBatch.mockResolvedValue([completion("suppressed")]);
    const result = await dependencies.worker.run();
    expect(result.suppressed).toBe(1);
    expect(dependencies.repository.completeBatch).toHaveBeenCalledWith([expect.objectContaining({
      retryable: false,
      errorCategory: "rejected",
    })]);
  });

  it("does not send twice when a repeated worker claim is empty", async () => {
    const dependencies = makeDependencies();
    dependencies.repository.claim
      .mockResolvedValueOnce([delivery])
      .mockResolvedValueOnce([]);
    await dependencies.worker.run();
    await dependencies.worker.run();
    expect(dependencies.adapter.send).toHaveBeenCalledOnce();
  });

  it("keeps already-claimed legacy v1 deliveries compatible without false confirmation", async () => {
    const legacyDelivery = {
      ...delivery,
      payloadVersion: 1,
      templateVersion: 1,
      payload: { ...(delivery.payload as Record<string, unknown>), locale: undefined },
    };
    const dependencies = makeDependencies(legacyDelivery);
    await dependencies.worker.run();
    expect(dependencies.adapter.send).toHaveBeenCalledWith(expect.objectContaining({
      subject: "Заказ NSUU-1 подтверждён",
      text: expect.stringContaining("Планируемая отгрузка"),
    }));
  });

  it("persists a bounded batch in one repository call", async () => {
    const second = {
      ...delivery,
      deliveryId: "77777777-7777-4777-8777-777777777777",
      eventId: "88888888-8888-4888-8888-888888888888",
      partnerOrderId: "99999999-9999-4999-8999-999999999999",
      idempotencyKey: "order.registered_in_1c:order-2:email:buyer@example.com:v2",
    };
    const dependencies = makeDependencies();
    dependencies.repository.claim.mockResolvedValue([delivery, second]);
    dependencies.repository.completeBatch.mockResolvedValue([
      completion("sent"),
      { deliveryId: second.deliveryId, status: "sent" },
    ]);
    const result = await dependencies.worker.run();
    expect(result).toMatchObject({ claimed: 2, sent: 2 });
    expect(dependencies.adapter.send).toHaveBeenCalledTimes(2);
    expect(dependencies.repository.completeBatch).toHaveBeenCalledOnce();
    expect(dependencies.repository.completeBatch.mock.calls[0][0]).toHaveLength(2);
  });

  it("does not call a provider for an unsupported future channel", async () => {
    const dependencies = makeDependencies({ ...delivery, channel: "sms" });
    dependencies.repository.completeBatch.mockResolvedValue([completion("dead_letter")]);
    const result = await dependencies.worker.run();
    expect(result.deadLetter).toBe(1);
    expect(dependencies.adapter.send).not.toHaveBeenCalled();
    expect(dependencies.repository.completeBatch).toHaveBeenCalledWith([expect.objectContaining({
      errorCategory: "CHANNEL_KILL_SWITCH",
      retryable: false,
    })]);
  });

  it("sends only the exact SUPPORT SMS sandbox snapshot through a targeted durable claim", async () => {
    vi.stubEnv("SMS_MODE", "SANDBOX");
    vi.stubEnv("COMMUNICATION_SMS_KILL_SWITCH", "OFF");
    vi.stubEnv("COMMUNICATION_SANDBOX_SMS_ALLOWLIST", "+99912345678");
    expect(communicationActivationPolicyFromEnvironment().purposeChannelModes.SUPPORT.sms).toBe("SANDBOX");
    const smsDelivery: ClaimedNotificationDelivery = {
      ...delivery,
      channel: "sms",
      channelMode: "SANDBOX",
      purpose: "SUPPORT",
      preferenceOutcome: "NOT_APPLICABLE",
      sandboxOutcome: "ALLOWED",
      eventType: "support.sms_sandbox_test",
      recipient: "+99912345678",
      renderedSnapshot: { subject: "Moldcell sandbox test", textBody: "NSD TEST: hello" },
      attemptId: "88888888-8888-4888-8888-888888888888",
    };
    const dependencies = makeDependencies(smsDelivery);
    const result = await dependencies.worker.runOne(smsDelivery.deliveryId);
    expect(result).toMatchObject({ sent: 1, suppressed: 0, failed: 0 });
    expect(dependencies.repository.completeBatch).toHaveBeenCalledWith([expect.objectContaining({ succeeded: true })]);
    expect(dependencies.repository.claimSpecific).toHaveBeenCalledWith(smsDelivery.deliveryId, 90);
    expect(dependencies.adapter.send).toHaveBeenCalledWith(expect.objectContaining({
      recipient: "+99912345678", text: "NSD TEST: hello", idempotencyKey: smsDelivery.idempotencyKey,
    }));
    expect(result.attempts?.[0]).toMatchObject({ attemptId: smsDelivery.attemptId, status: "sent" });
  });

  it("fails a cross-purpose SMS sandbox snapshot closed", async () => {
    vi.stubEnv("SMS_MODE", "SANDBOX");
    vi.stubEnv("COMMUNICATION_SMS_KILL_SWITCH", "OFF");
    vi.stubEnv("COMMUNICATION_SANDBOX_SMS_ALLOWLIST", "+99912345678");
    const smsDelivery: ClaimedNotificationDelivery = {
      ...delivery,
      channel: "sms",
      channelMode: "SANDBOX",
      purpose: "FINANCE",
      eventType: "finance.payment_reminder",
      recipient: "+99912345678",
      renderedSnapshot: { subject: "unsafe", textBody: "unsafe" },
    };
    const dependencies = makeDependencies(smsDelivery);
    dependencies.repository.completeBatch.mockResolvedValue([completion("suppressed")]);
    const result = await dependencies.worker.runOne(smsDelivery.deliveryId);
    expect(result.suppressed).toBe(1);
    expect(dependencies.adapter.send).not.toHaveBeenCalled();
  });
});

const delivery: ClaimedNotificationDelivery = {
  deliveryId: "11111111-1111-4111-8111-111111111111",
  eventId: "22222222-2222-4222-8222-222222222222",
  eventType: "order.registered_in_1c",
  companyId: "33333333-3333-4333-8333-333333333333",
  partnerOrderId: "44444444-4444-4444-8444-444444444444",
  correlationId: "55555555-5555-4555-8555-555555555555",
  payloadVersion: 2,
  payload: {
    locale: "ro",
    customerName: "Vasili",
    companyName: "Partner SRL",
    portalOrderId: "44444444-4444-4444-8444-444444444444",
    oneCOrderNumber: "NSUU-1",
    orderDate: "2026-08-27T10:00:00.000Z",
    requestedDeliveryDate: "2026-08-30",
    confirmedDeliveryDate: "2026-08-30",
    paymentMethod: "cashless",
    paymentCalendar: [{ date: "2026-08-29", amount: 10, currency: "MDL" }],
    orderTotal: 10,
    currency: "MDL",
    orderPath: "/cabinet/orders/44444444-4444-4444-8444-444444444444",
  },
  channel: "email",
  recipient: "buyer@example.com",
  templateVersion: 2,
  attempt: 1,
  leaseToken: "66666666-6666-4666-8666-666666666666",
  idempotencyKey: "order.registered_in_1c:order:email:buyer@example.com:v2",
};

function completion(status: CompleteNotificationDeliveryResult["status"]) {
  return { deliveryId: delivery.deliveryId, status };
}

function makeDependencies(claimed = delivery) {
  const repository = {
    claim: vi.fn().mockResolvedValue([claimed]),
    claimSpecific: vi.fn().mockResolvedValue(claimed),
    reserveRateLimits: vi.fn().mockImplementation(async (
      claims: ReadonlyArray<{ deliveryId: string; leaseToken: string }>,
    ) => claims.map((claim) => ({
      deliveryId: claim.deliveryId, outcome: "ALLOWED" as const,
      recipientCount: 1, companyCount: 1, recipientLimit: 10, companyLimit: 100,
    }))),
    completeBatch: vi.fn<(input: CompleteNotificationDeliveryInput[]) => Promise<CompleteNotificationDeliveryResult[]>>()
      .mockResolvedValue([completion("sent")]),
  } satisfies NotificationDeliveryRepository;
  const adapter = {
    channel: claimed.channel === "sms" ? "sms" as const : "email" as const,
    send: vi.fn<NotificationChannelAdapter["send"]>()
      .mockResolvedValue({ providerMessageId: "message-1" }),
  };
  return {
    repository,
    adapter,
    worker: new NotificationDeliveryWorkerService(repository, [adapter], { concurrency: 2 }),
  };
}
