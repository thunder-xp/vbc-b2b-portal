import "server-only";

import { createHash } from "node:crypto";

import type {
  CommunicationChannel,
  CommunicationChannelMode,
  CommunicationIntent,
  CommunicationProjection,
  CommunicationSuppressionReason,
  RenderedCommunication,
} from "./communication-intent";
import {
  communicationActivationPolicyFromEnvironment,
  evaluateCommunicationPolicy,
  markSandboxEmail,
  type CommunicationActivationPolicy,
  type CommunicationPolicyDecision,
} from "./communication-policy.service";
import { CommunicationTemplateRegistry } from "./communication-template.registry";
import { normalizeE164Phone } from "./sms-phone";

export const COMMUNICATION_EXTERNAL_CHANNELS = ["email", "sms"] as const;

export type CommunicationRuntimePolicy = CommunicationActivationPolicy;

export type CommunicationProviderAdapter = {
  readonly channel: "email" | "sms";
  send(input: {
    deliveryIdentity: string;
    recipient: Readonly<{ email?: string | null; phone?: string | null }>;
    rendered: RenderedCommunication;
  }): Promise<{ providerRequestId: string }>;
};

export function communicationRuntimePolicyFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): CommunicationRuntimePolicy {
  return communicationActivationPolicyFromEnvironment(environment);
}

export class CommunicationGatewayService {
  private readonly adapters: ReadonlyMap<string, CommunicationProviderAdapter>;

  constructor(
    private readonly templates: CommunicationTemplateRegistry,
    adapters: readonly CommunicationProviderAdapter[] = [],
    private readonly runtimePolicy: CommunicationRuntimePolicy = communicationRuntimePolicyFromEnvironment(),
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.channel, adapter]));
  }

  project(intent: CommunicationIntent, channel: CommunicationChannel): CommunicationProjection {
    const mode = intent.channelPolicy[channel] ?? "DISABLED";
    const decision = evaluateCommunicationPolicy({
      intent,
      channel,
      mode,
      activation: {
        ...this.runtimePolicy,
        globalExternalKillSwitch: false,
        channelKillSwitches: { email: false, sms: false },
      },
      preferenceOutcome: intent.preferencePolicy?.[channel],
    });
    if (decision.decision === "SUPPRESS" && decision.reason !== "CHANNEL_DISABLED") {
      return suppressed(intent, channel, mode, decision);
    }

    const rendered = this.templates.render(intent, channel);
    if (decision.decision === "SUPPRESS") return suppressed(intent, channel, mode, decision, rendered);
    return baseProjection(intent, channel, mode, "PROJECTED", null, rendered, null, decision);
  }

  async dispatch(intent: CommunicationIntent, channel: CommunicationChannel): Promise<CommunicationProjection> {
    const projection = this.project(intent, channel);
    if (projection.state === "SUPPRESSED") return projection;

    if (projection.mode === "DRY_RUN" || channel === "in_app") return projection;

    const adapter = this.adapters.get(channel);
    const decision = evaluateCommunicationPolicy({
      intent,
      channel,
      mode: projection.mode,
      activation: this.runtimePolicy,
      preferenceOutcome: projection.preferenceOutcome,
      providerAvailable: Boolean(adapter),
    });
    if (decision.decision === "SUPPRESS") return suppressed(intent, channel, projection.mode, decision, projection.rendered);
    const rendered = projection.mode === "SANDBOX" && channel === "email"
      ? sandboxRendered(projection.rendered!, decision, intent)
      : projection.rendered!;
    const recipient = projection.mode === "SANDBOX" && channel === "email"
      ? { ...projection.recipient, email: decision.sandboxActualRecipient }
      : projection.recipient;
    const result = await adapter!.send({
      deliveryIdentity: projection.deliveryIdentity,
      recipient,
      rendered,
    });
    return baseProjection(intent, channel, projection.mode, "ACCEPTED", null, rendered, result.providerRequestId, decision);
  }
}

function suppressed(
  intent: CommunicationIntent,
  channel: CommunicationChannel,
  mode: CommunicationChannelMode,
  decision: CommunicationPolicyDecision,
  rendered: RenderedCommunication | null = null,
): CommunicationProjection {
  return baseProjection(intent, channel, mode, "SUPPRESSED", decision.reason, rendered, null, decision);
}

function baseProjection(
  intent: CommunicationIntent,
  channel: CommunicationChannel,
  mode: CommunicationChannelMode,
  state: CommunicationProjection["state"],
  suppressionReason: CommunicationSuppressionReason | null,
  rendered: RenderedCommunication | null,
  providerRequestId: string | null,
  decision: CommunicationPolicyDecision,
): CommunicationProjection {
  return Object.freeze({
    intentId: intent.intentId,
    purpose: intent.purpose,
    deliveryIdentity: deliveryIdentity(intent, channel),
    businessEventType: intent.businessEventType,
    businessEntityReferences: Object.freeze([...intent.businessEntityReferences]),
    companyId: intent.companyId,
    recipient: Object.freeze({ ...intent.recipient }),
    channel,
    mode,
    requestedMode: decision.requestedMode,
    effectiveMode: decision.effectiveMode,
    policyDecision: decision.decision,
    preferenceOutcome: decision.preferenceOutcome,
    rateLimitOutcome: decision.rateLimitOutcome,
    sandboxOutcome: decision.sandboxOutcome,
    sandboxActualRecipient: decision.sandboxActualRecipient,
    originalRecipientFingerprint: decision.originalRecipientFingerprint,
    templateKey: intent.templateKey,
    templateVersion: intent.templateVersion,
    locale: intent.recipient.locale,
    sensitivity: intent.sensitivity,
    scheduledBusinessDate: intent.scheduledBusinessDate,
    correlationId: intent.correlationId,
    state,
    suppressionReason,
    rendered,
    providerRequestId,
  });
}

export function deliveryIdentity(intent: CommunicationIntent, channel: CommunicationChannel): string {
  const address = channel === "email"
    ? intent.recipient.email?.trim().toLowerCase() ?? ""
    : channel === "sms"
      ? normalizeE164Phone(intent.recipient.phone ?? "") ?? ""
      : intent.recipient.userId;
  return createHash("sha256")
    .update([intent.idempotencyIdentity, channel, intent.recipient.userId, address].join("|"))
    .digest("hex");
}

function sandboxRendered(
  rendered: RenderedCommunication,
  decision: CommunicationPolicyDecision,
  intent: CommunicationIntent,
): RenderedCommunication {
  const marked = markSandboxEmail({
    purpose: intent.purpose,
    companyId: intent.companyId,
    originalRecipientFingerprint: decision.originalRecipientFingerprint,
    subject: rendered.subject,
    text: rendered.textBody,
    html: rendered.htmlBody ?? "",
  });
  return Object.freeze({
    ...rendered,
    subject: marked.subject,
    textBody: marked.text,
    htmlBody: marked.html,
  });
}
