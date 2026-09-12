import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CommunicationGatewayService,
  CommunicationTemplateRegistry,
  communicationRuntimePolicyFromEnvironment,
  deliveryIdentity,
  type CommunicationIntent,
  type CommunicationProviderAdapter,
} from "../gateway";

describe("CommunicationGatewayService", () => {
  it("defaults future SMS to stopped while preserving independent email control", () => {
    expect(communicationRuntimePolicyFromEnvironment({})).toMatchObject({
      globalExternalKillSwitch: false,
      channelKillSwitches: { email: false, sms: true },
    });
    expect(communicationRuntimePolicyFromEnvironment({
      COMMUNICATION_EMAIL_KILL_SWITCH: "ON",
      COMMUNICATION_SMS_KILL_SWITCH: "OFF",
    })).toMatchObject({
      globalExternalKillSwitch: false,
      channelKillSwitches: { email: true, sms: false },
    });
  });

  it("opens only SUPPORT SMS sandbox and only for strict allowlisted E.164 recipients", () => {
    const policy = communicationRuntimePolicyFromEnvironment({
      SMS_MODE: "SANDBOX",
      COMMUNICATION_SMS_KILL_SWITCH: "OFF",
      SMS_SANDBOX_ALLOWED_RECIPIENTS: "+37369000000,37368000000,invalid",
    });
    expect(policy.purposeChannelModes.SUPPORT.sms).toBe("SANDBOX");
    expect(policy.purposeChannelModes.FINANCE.sms).toBe("DISABLED");
    expect(policy.purposeChannelModes.MARKETING.sms).toBe("DISABLED");
    expect([...policy.sandboxSmsAllowlist]).toEqual(["+37369000000"]);
  });

  it("keeps the legacy SMS allowlist name as a compatibility fallback", () => {
    const policy = communicationRuntimePolicyFromEnvironment({
      SMS_MODE: "SANDBOX",
      COMMUNICATION_SANDBOX_SMS_ALLOWLIST: "+37368000000",
    });

    expect([...policy.sandboxSmsAllowlist]).toEqual(["+37368000000"]);
  });

  it("runs DRY_RUN through deterministic rendering without invoking a provider", async () => {
    const adapter = emailAdapter();
    const gateway = new CommunicationGatewayService(registry(), [adapter], openRuntimePolicy());
    const result = await gateway.dispatch(intent(), "email");

    expect(result).toMatchObject({
      state: "PROJECTED",
      mode: "DRY_RUN",
      templateKey: "test.transactional",
      templateVersion: "v1",
      locale: "ru",
      sensitivity: "FINANCIAL_PRIVATE",
      providerRequestId: null,
    });
    expect(result.rendered).toMatchObject({ subject: "ru:email", textBody: "safe-body" });
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it("blocks every external provider when the global kill switch is on", async () => {
    const adapter = emailAdapter();
    const gateway = new CommunicationGatewayService(registry(), [adapter], runtimePolicy({
      globalExternalKillSwitch: true,
      channelKillSwitches: { email: false, sms: false },
    }));
    const result = await gateway.dispatch(intent({ email: "LIVE" }), "email");

    expect(result).toMatchObject({ state: "SUPPRESSED", suppressionReason: "GLOBAL_KILL_SWITCH" });
    expect(result.rendered).toMatchObject({ subject: "ru:email" });
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it("blocks email at the independent channel switch", async () => {
    const adapter = emailAdapter();
    const gateway = new CommunicationGatewayService(registry(), [adapter], runtimePolicy({
      globalExternalKillSwitch: false,
      channelKillSwitches: { email: true, sms: true },
    }));
    const result = await gateway.dispatch(intent({ email: "LIVE" }), "email");

    expect(result).toMatchObject({ state: "SUPPRESSED", suppressionReason: "CHANNEL_KILL_SWITCH" });
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it("blocks a disabled channel after preserving an internal preview", async () => {
    const adapter = emailAdapter();
    const gateway = new CommunicationGatewayService(registry(), [adapter], openRuntimePolicy());
    const result = await gateway.dispatch(intent({ email: "DISABLED" }), "email");

    expect(result).toMatchObject({ state: "SUPPRESSED", suppressionReason: "CHANNEL_DISABLED" });
    expect(result.rendered).toMatchObject({ textBody: "safe-body" });
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it("suppresses a cross-company or invalid recipient before rendering", async () => {
    const render = vi.fn(() => ({ subject: "unsafe", textBody: "unsafe", providerPayload: {} }));
    const templates = new CommunicationTemplateRegistry().register({
      templateKey: "test.transactional", templateVersion: "v1", locale: "ru", channel: "email", render,
    });
    const adapter = emailAdapter();
    const gateway = new CommunicationGatewayService(templates, [adapter], openRuntimePolicy());
    const base = intent();
    const mismatch = { ...base, recipient: { ...base.recipient, companyId: "company-2" } };
    const invalid = { ...base, recipient: { ...base.recipient, email: "invalid" } };

    await expect(gateway.dispatch(mismatch, "email")).resolves.toMatchObject({ suppressionReason: "COMPANY_MISMATCH" });
    await expect(gateway.dispatch(invalid, "email")).resolves.toMatchObject({ suppressionReason: "INVALID_RECIPIENT" });
    expect(render).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it("keeps recipient and delivery identity immutable across a LIVE provider retry simulation", async () => {
    const adapter = emailAdapter();
    adapter.send.mockRejectedValueOnce(new Error("retryable")).mockResolvedValueOnce({ providerRequestId: "accepted-1" });
    const input = intent({ email: "LIVE" });
    const gateway = new CommunicationGatewayService(registry(), [adapter], openRuntimePolicy());
    const expectedIdentity = deliveryIdentity(input, "email");

    await expect(gateway.dispatch(input, "email")).rejects.toThrow("retryable");
    await expect(gateway.dispatch(input, "email")).resolves.toMatchObject({
      state: "ACCEPTED", deliveryIdentity: expectedIdentity, providerRequestId: "accepted-1",
    });
    expect(adapter.send).toHaveBeenNthCalledWith(1, expect.objectContaining({ deliveryIdentity: expectedIdentity }));
    expect(adapter.send).toHaveBeenNthCalledWith(2, expect.objectContaining({ deliveryIdentity: expectedIdentity }));
  });

  it("keeps in-app first-party projection separate from external kill switches", async () => {
    const basePolicy = runtimePolicy({
      globalExternalKillSwitch: true,
      channelKillSwitches: { email: true, sms: true },
    });
    const gateway = new CommunicationGatewayService(registry(), [], {
      ...basePolicy,
      purposeChannelModes: {
        ...basePolicy.purposeChannelModes,
        TRANSACTIONAL: { ...basePolicy.purposeChannelModes.TRANSACTIONAL, in_app: "DRY_RUN" },
      },
    });
    const result = await gateway.dispatch(intent({ in_app: "DRY_RUN" }), "in_app");
    expect(result).toMatchObject({ state: "PROJECTED", channel: "in_app", mode: "DRY_RUN" });
  });

  it("redirects SANDBOX email only to the server allowlist and marks the payload", async () => {
    const adapter = emailAdapter();
    const base = openRuntimePolicy();
    const gateway = new CommunicationGatewayService(registry(), [adapter], {
      ...base,
      purposeChannelModes: {
        ...base.purposeChannelModes,
        TRANSACTIONAL: { ...base.purposeChannelModes.TRANSACTIONAL, email: "SANDBOX" },
      },
      sandboxEmailRecipient: "internal@novotech.test",
      sandboxEmailAllowlist: new Set(["internal@novotech.test"]),
    });
    const result = await gateway.dispatch(intent({ email: "SANDBOX" }), "email");

    expect(result).toMatchObject({ state: "ACCEPTED", mode: "SANDBOX", sandboxOutcome: "ALLOWED" });
    expect(adapter.send).toHaveBeenCalledWith(expect.objectContaining({
      recipient: expect.objectContaining({ email: "internal@novotech.test" }),
      rendered: expect.objectContaining({ subject: "[SANDBOX] ru:email" }),
    }));
    expect(adapter.send).not.toHaveBeenCalledWith(expect.objectContaining({
      recipient: expect.objectContaining({ email: "partner@example.test" }),
    }));
  });

  it("fails SANDBOX closed when the configured target is outside the server allowlist", async () => {
    const adapter = emailAdapter();
    const base = openRuntimePolicy();
    const gateway = new CommunicationGatewayService(registry(), [adapter], {
      ...base,
      purposeChannelModes: {
        ...base.purposeChannelModes,
        TRANSACTIONAL: { ...base.purposeChannelModes.TRANSACTIONAL, email: "SANDBOX" },
      },
      sandboxEmailRecipient: "unapproved@example.test",
      sandboxEmailAllowlist: new Set(["internal@novotech.test"]),
    });

    await expect(gateway.dispatch(intent({ email: "SANDBOX" }), "email")).resolves.toMatchObject({
      state: "SUPPRESSED",
      suppressionReason: "SANDBOX_RECIPIENT_NOT_ALLOWED",
    });
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it("fails an unknown or mismatched purpose closed", async () => {
    const input = { ...intent(), businessEventType: "unknown.future_flow" };
    const gateway = new CommunicationGatewayService(registry(), [emailAdapter()], openRuntimePolicy());
    await expect(gateway.dispatch(input, "email")).resolves.toMatchObject({
      state: "SUPPRESSED",
      suppressionReason: "PURPOSE_DISABLED",
    });
  });

  it("honors a purpose-specific preference suppression without invoking a provider", async () => {
    const adapter = emailAdapter();
    const input = { ...intent({ email: "LIVE" }), preferencePolicy: { email: "SUPPRESSED" as const } };
    const gateway = new CommunicationGatewayService(registry(), [adapter], openRuntimePolicy());
    await expect(gateway.dispatch(input, "email")).resolves.toMatchObject({
      policyDecision: "SUPPRESS",
      suppressionReason: "PREFERENCE_DISABLED",
    });
    expect(adapter.send).not.toHaveBeenCalled();
  });
});

function registry() {
  const templates = new CommunicationTemplateRegistry();
  for (const channel of ["email", "in_app"] as const) {
    templates.register({
      templateKey: "test.transactional",
      templateVersion: "v1",
      locale: "ru",
      channel,
      render: (value, selectedChannel) => ({
        subject: `${value.recipient.locale}:${selectedChannel}`,
        textBody: "safe-body",
        providerPayload: { referenceCount: value.businessEntityReferences.length },
      }),
    });
  }
  return templates;
}

function intent(
  channelPolicy: CommunicationIntent["channelPolicy"] = { email: "DRY_RUN", in_app: "DRY_RUN", sms: "DISABLED" },
): CommunicationIntent {
  return Object.freeze({
    intentId: "intent-1",
    purpose: "TRANSACTIONAL",
    businessEventType: "proposal.delivery",
    businessEntityReferences: Object.freeze(["entity-1"]),
    companyId: "company-1",
    recipient: Object.freeze({
      userId: "user-1",
      companyId: "company-1",
      locale: "ru",
      email: "partner@example.test",
      phone: null,
      identityVerified: true,
      membershipActive: true,
      capabilityAuthorized: true,
    }),
    templateKey: "test.transactional",
    templateVersion: "v1",
    channelPolicy,
    variables: Object.freeze({ safeReference: "entity-1" }),
    cta: Object.freeze({ label: "Open", target: "/cabinet/test" }),
    priority: "normal",
    scheduledBusinessDate: "2026-09-07",
    correlationId: "correlation-1",
    idempotencyIdentity: "business-intent-1",
    sensitivity: "FINANCIAL_PRIVATE",
  });
}

function emailAdapter() {
  return {
    channel: "email" as const,
    send: vi.fn<CommunicationProviderAdapter["send"]>().mockResolvedValue({ providerRequestId: "accepted-1" }),
  };
}

function openRuntimePolicy() {
  return communicationRuntimePolicyFromEnvironment({ COMMUNICATION_SMS_KILL_SWITCH: "OFF" });
}

function runtimePolicy(input: { globalExternalKillSwitch: boolean; channelKillSwitches: { email: boolean; sms: boolean } }) {
  return { ...openRuntimePolicy(), ...input };
}
