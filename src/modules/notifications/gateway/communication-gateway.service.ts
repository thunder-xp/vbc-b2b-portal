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
import { CommunicationTemplateRegistry } from "./communication-template.registry";

export const COMMUNICATION_EXTERNAL_CHANNELS = ["email", "sms"] as const;

export type CommunicationRuntimePolicy = Readonly<{
  globalExternalKillSwitch: boolean;
  channelKillSwitches: Readonly<Record<"email" | "sms", boolean>>;
}>;

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
  return Object.freeze({
    globalExternalKillSwitch: environment.COMMUNICATION_OUTBOUND_KILL_SWITCH === "ON",
    channelKillSwitches: Object.freeze({
      email: environment.COMMUNICATION_EMAIL_KILL_SWITCH === "ON",
      sms: environment.COMMUNICATION_SMS_KILL_SWITCH !== "OFF",
    }),
  });
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
    const recipientFailure = recipientSuppression(intent, channel);
    if (recipientFailure) return suppressed(intent, channel, mode, recipientFailure);

    const rendered = this.templates.render(intent, channel);
    if (mode === "DISABLED") return suppressed(intent, channel, mode, "CHANNEL_DISABLED", rendered);
    return baseProjection(intent, channel, mode, "PROJECTED", null, rendered, null);
  }

  async dispatch(intent: CommunicationIntent, channel: CommunicationChannel): Promise<CommunicationProjection> {
    const projection = this.project(intent, channel);
    if (projection.state === "SUPPRESSED") return projection;

    const safetyFailure = policySuppression(channel, projection.mode, this.runtimePolicy);
    if (safetyFailure) return suppressed(intent, channel, projection.mode, safetyFailure, projection.rendered);
    if (projection.mode === "DRY_RUN" || channel === "in_app") return projection;

    const adapter = this.adapters.get(channel);
    if (!adapter) return suppressed(intent, channel, projection.mode, "PROVIDER_UNAVAILABLE", projection.rendered);
    const result = await adapter.send({
      deliveryIdentity: projection.deliveryIdentity,
      recipient: projection.recipient,
      rendered: projection.rendered!,
    });
    return baseProjection(intent, channel, projection.mode, "ACCEPTED", null, projection.rendered, result.providerRequestId);
  }
}

function recipientSuppression(
  intent: CommunicationIntent,
  channel: CommunicationChannel,
): CommunicationSuppressionReason | null {
  if (intent.recipient.companyId !== intent.companyId) return "COMPANY_MISMATCH";
  if (!intent.recipient.identityVerified) return "IDENTITY_NOT_VERIFIED";
  if (!intent.recipient.membershipActive) return "INACTIVE_MEMBERSHIP";
  if (!intent.recipient.capabilityAuthorized) return "CAPABILITY_NOT_AUTHORIZED";
  if (!intent.recipient.userId) return "INVALID_RECIPIENT";
  if (channel === "email" && !validEmail(intent.recipient.email)) return "INVALID_RECIPIENT";
  if (channel === "sms" && intent.channelPolicy.sms === "LIVE" && !validPhone(intent.recipient.phone)) return "INVALID_RECIPIENT";
  return null;
}

function policySuppression(
  channel: CommunicationChannel,
  mode: CommunicationChannelMode,
  policy: CommunicationRuntimePolicy,
): CommunicationSuppressionReason | null {
  if (mode === "DISABLED") return "CHANNEL_DISABLED";
  if (channel === "in_app") return null;
  if (policy.globalExternalKillSwitch) return "GLOBAL_KILL_SWITCH";
  if (policy.channelKillSwitches[channel]) return "CHANNEL_KILL_SWITCH";
  return null;
}

function suppressed(
  intent: CommunicationIntent,
  channel: CommunicationChannel,
  mode: CommunicationChannelMode,
  reason: CommunicationSuppressionReason,
  rendered: RenderedCommunication | null = null,
): CommunicationProjection {
  return baseProjection(intent, channel, mode, "SUPPRESSED", reason, rendered, null);
}

function baseProjection(
  intent: CommunicationIntent,
  channel: CommunicationChannel,
  mode: CommunicationChannelMode,
  state: CommunicationProjection["state"],
  suppressionReason: CommunicationSuppressionReason | null,
  rendered: RenderedCommunication | null,
  providerRequestId: string | null,
): CommunicationProjection {
  return Object.freeze({
    intentId: intent.intentId,
    deliveryIdentity: deliveryIdentity(intent, channel),
    businessEventType: intent.businessEventType,
    businessEntityReferences: Object.freeze([...intent.businessEntityReferences]),
    companyId: intent.companyId,
    recipient: Object.freeze({ ...intent.recipient }),
    channel,
    mode,
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
      ? intent.recipient.phone?.replace(/\s+/g, "") ?? ""
      : intent.recipient.userId;
  return createHash("sha256")
    .update([intent.idempotencyIdentity, channel, intent.recipient.userId, address].join("|"))
    .digest("hex");
}

function validEmail(value: string | null | undefined): value is string {
  return Boolean(value && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function validPhone(value: string | null | undefined): value is string {
  return Boolean(value && /^\+[1-9]\d{7,14}$/.test(value.replace(/[\s()-]/g, "")));
}
