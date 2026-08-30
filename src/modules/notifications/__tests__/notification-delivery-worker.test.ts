import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CompleteNotificationDeliveryInput,
  CompleteNotificationDeliveryResult,
  NotificationDeliveryRepository,
} from "../gateway/notification-delivery.repository";
import {
  NotificationDeliveryError,
  NotificationDeliveryWorkerService,
  type ClaimedNotificationDelivery,
  type NotificationChannelAdapter,
} from "../gateway";

describe("NotificationDeliveryWorkerService", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
    dependencies.repository.completeBatch.mockResolvedValue([completion("dead_letter")]);
    const result = await dependencies.worker.run();
    expect(result.deadLetter).toBe(1);
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
      errorCategory: "unsupported_channel",
      retryable: false,
    })]);
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
    completeBatch: vi.fn<(input: CompleteNotificationDeliveryInput[]) => Promise<CompleteNotificationDeliveryResult[]>>()
      .mockResolvedValue([completion("sent")]),
  } satisfies NotificationDeliveryRepository;
  const adapter = {
    channel: "email" as const,
    send: vi.fn<NotificationChannelAdapter["send"]>()
      .mockResolvedValue({ providerMessageId: "message-1" }),
  };
  return {
    repository,
    adapter,
    worker: new NotificationDeliveryWorkerService(repository, [adapter], { concurrency: 2 }),
  };
}
