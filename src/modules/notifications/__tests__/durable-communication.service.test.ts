import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CommunicationGatewayService,
  CommunicationTemplateRegistry,
  deliveryIdentity,
  DurableCommunicationService,
  type CommunicationIntent,
  type DurableCommunicationRepository,
} from "../gateway";

describe("DurableCommunicationService", () => {
  it("persists one intent with independent deterministic channel deliveries and no provider call", async () => {
    const input = intent();
    const repository = repositoryMock(input);
    const service = new DurableCommunicationService(gateway(), repository);

    const result = await service.persist(input, ["email", "in_app", "sms", "email"]);

    expect(result.intentId).toBe(input.intentId);
    expect(repository.persist).toHaveBeenCalledOnce();
    const projections = vi.mocked(repository.persist).mock.calls[0]![1];
    expect(projections).toHaveLength(3);
    expect(projections.map((projection) => projection.deliveryIdentity)).toEqual([
      deliveryIdentity(input, "email"),
      deliveryIdentity(input, "in_app"),
      deliveryIdentity(input, "sms"),
    ]);
    expect(projections).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "email", mode: "DRY_RUN", state: "PROJECTED" }),
      expect.objectContaining({ channel: "in_app", mode: "DRY_RUN", state: "PROJECTED" }),
      expect.objectContaining({ channel: "sms", mode: "DISABLED", state: "SUPPRESSED", suppressionReason: "CHANNEL_DISABLED" }),
    ]));
  });

  it("keeps DRY_RUN and LIVE mode outside deterministic delivery identity", async () => {
    const dryRun = intent();
    const live = { ...dryRun, channelPolicy: { ...dryRun.channelPolicy, email: "LIVE" as const } };
    expect(deliveryIdentity(dryRun, "email")).toBe(deliveryIdentity(live, "email"));
    expect(dryRun.channelPolicy.email).toBe("DRY_RUN");
    expect(live.channelPolicy.email).toBe("LIVE");
  });
});

function gateway() {
  const templates = new CommunicationTemplateRegistry();
  for (const channel of ["email", "in_app", "sms"] as const) {
    templates.register({
      templateKey: "finance.payment_reminder",
      templateVersion: "v1",
      locale: "ru",
      channel,
      render: () => ({
        subject: `subject:${channel}`,
        textBody: `body:${channel}`,
        providerPayload: { safeReference: "obligation-1" },
      }),
    });
  }
  return new CommunicationGatewayService(templates);
}

function repositoryMock(input: CommunicationIntent) {
  return {
    persist: vi.fn<DurableCommunicationRepository["persist"]>().mockResolvedValue({
      intentId: input.intentId,
      eventId: "11111111-1111-4111-8111-111111111111",
      deliveries: [
        {
          deliveryId: "22222222-2222-4222-8222-222222222222",
          deliveryIdentity: deliveryIdentity(input, "email"),
          channel: "email",
          channelMode: "DRY_RUN",
          state: "PROJECTED",
        },
      ],
    }),
  } satisfies DurableCommunicationRepository;
}

function intent(): CommunicationIntent {
  return {
    intentId: "finance-intent-1",
    purpose: "FINANCE",
    businessEventType: "finance.payment_reminder",
    businessEntityReferences: ["obligation-1"],
    companyId: "company-1",
    recipient: {
      userId: "user-1",
      companyId: "company-1",
      locale: "ru",
      email: "partner@example.test",
      phone: null,
      identityVerified: true,
      membershipActive: true,
      capabilityAuthorized: true,
    },
    templateKey: "finance.payment_reminder",
    templateVersion: "v1",
    channelPolicy: { email: "DRY_RUN", in_app: "DRY_RUN", sms: "DISABLED" },
    variables: { safeReference: "obligation-1" },
    cta: { label: "Open", target: "/cabinet/finance" },
    priority: "normal",
    scheduledBusinessDate: "2026-09-07",
    correlationId: "finance-intent-1",
    idempotencyIdentity: "finance-business-identity-1",
    sensitivity: "FINANCIAL_PRIVATE",
  };
}
