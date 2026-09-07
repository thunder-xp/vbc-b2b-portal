import "server-only";

import { createHash } from "node:crypto";

import type {
  CommunicationChannel,
  CommunicationChannelMode,
  CommunicationIntent,
  CommunicationPreferenceOutcome,
  CommunicationPurpose,
  CommunicationRateLimitOutcome,
  CommunicationSandboxOutcome,
  CommunicationSuppressionReason,
} from "./communication-intent";

export type CommunicationPolicyDecision = Readonly<{
  decision: "ALLOW" | "SUPPRESS";
  reason: CommunicationSuppressionReason | null;
  requestedMode: CommunicationChannelMode;
  effectiveMode: CommunicationChannelMode;
  preferenceOutcome: CommunicationPreferenceOutcome;
  rateLimitOutcome: CommunicationRateLimitOutcome;
  sandboxOutcome: CommunicationSandboxOutcome;
  sandboxActualRecipient: string | null;
  originalRecipientFingerprint: string;
}>;

export type CommunicationActivationPolicy = Readonly<{
  globalExternalKillSwitch: boolean;
  channelKillSwitches: Readonly<Record<"email" | "sms", boolean>>;
  purposeChannelModes: Readonly<Record<CommunicationPurpose, Readonly<Record<CommunicationChannel, CommunicationChannelMode>>>>;
  sandboxEmailRecipient: string | null;
  sandboxEmailAllowlist: ReadonlySet<string>;
}>;

export const DEFAULT_PURPOSE_CHANNEL_MODES = Object.freeze({
  TRANSACTIONAL: Object.freeze({ email: "LIVE", in_app: "DISABLED", sms: "DISABLED" }),
  FINANCE: Object.freeze({ email: "DRY_RUN", in_app: "DRY_RUN", sms: "DISABLED" }),
  SECURITY: Object.freeze({ email: "DISABLED", in_app: "DISABLED", sms: "DISABLED" }),
  SUPPORT: Object.freeze({ email: "DISABLED", in_app: "DISABLED", sms: "DISABLED" }),
  MARKETING: Object.freeze({ email: "DISABLED", in_app: "DISABLED", sms: "DISABLED" }),
}) satisfies CommunicationActivationPolicy["purposeChannelModes"];

export function communicationActivationPolicyFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): CommunicationActivationPolicy {
  const allowlist = new Set((environment.COMMUNICATION_SANDBOX_EMAIL_ALLOWLIST ?? "")
    .split(",").map(normalizeEmail).filter((value): value is string => Boolean(value)));
  const sandboxEmailRecipient = normalizeEmail(environment.COMMUNICATION_SANDBOX_EMAIL_RECIPIENT ?? "");
  return Object.freeze({
    globalExternalKillSwitch: environment.COMMUNICATION_OUTBOUND_KILL_SWITCH === "ON",
    channelKillSwitches: Object.freeze({
      email: environment.COMMUNICATION_EMAIL_KILL_SWITCH === "ON",
      sms: environment.COMMUNICATION_SMS_KILL_SWITCH !== "OFF",
    }),
    purposeChannelModes: DEFAULT_PURPOSE_CHANNEL_MODES,
    sandboxEmailRecipient,
    sandboxEmailAllowlist: allowlist,
  });
}

export function classifyCommunicationPurpose(eventType: string): CommunicationPurpose | null {
  if (["order.registered_in_1c", "proposal.delivery", "company.invitation"].includes(eventType)) return "TRANSACTIONAL";
  if (eventType.startsWith("finance.")) return "FINANCE";
  if (eventType.startsWith("security.")) return "SECURITY";
  if (eventType.startsWith("support.")) return "SUPPORT";
  if (eventType.startsWith("marketing.") || eventType.startsWith("commercial.")) return "MARKETING";
  return null;
}

export function evaluateCommunicationPolicy(input: {
  intent: Pick<CommunicationIntent, "purpose" | "businessEventType" | "companyId" | "recipient">;
  channel: CommunicationChannel;
  mode: CommunicationChannelMode;
  activation: CommunicationActivationPolicy;
  preferenceOutcome?: CommunicationPreferenceOutcome;
  rateLimitOutcome?: CommunicationRateLimitOutcome;
  duplicate?: boolean;
  providerAvailable?: boolean;
}): CommunicationPolicyDecision {
  const { intent, channel, mode, activation } = input;
  const preferenceOutcome = input.preferenceOutcome ?? defaultPreferenceOutcome(intent.purpose, channel);
  const rateLimitOutcome = input.rateLimitOutcome ?? "NOT_EVALUATED";
  const originalRecipient = channel === "email" ? intent.recipient.email ?? ""
    : channel === "sms" ? intent.recipient.phone ?? "" : intent.recipient.userId;
  const originalRecipientFingerprint = fingerprint(originalRecipient);
  let sandboxOutcome: CommunicationSandboxOutcome = "NOT_APPLICABLE";
  let sandboxActualRecipient: string | null = null;
  let reason: CommunicationSuppressionReason | null = null;

  // This ordering is the canonical suppression precedence.
  if (mode === "DISABLED") reason = "CHANNEL_DISABLED";
  else if (channel !== "in_app" && (mode === "LIVE" || mode === "SANDBOX") && activation.globalExternalKillSwitch) reason = "GLOBAL_KILL_SWITCH";
  else if (channel !== "in_app" && (mode === "LIVE" || mode === "SANDBOX") && activation.channelKillSwitches[channel]) reason = "CHANNEL_KILL_SWITCH";
  else if (classifyCommunicationPurpose(intent.businessEventType) !== intent.purpose) reason = "PURPOSE_DISABLED";
  else if (activation.purposeChannelModes[intent.purpose][channel] !== mode
    && !(activation.purposeChannelModes[intent.purpose][channel] === "LIVE" && mode === "DRY_RUN")) reason = "MODE_DISABLED";
  else if (intent.recipient.companyId !== intent.companyId) reason = "COMPANY_MISMATCH";
  else if (!intent.recipient.identityVerified || !intent.recipient.membershipActive || !intent.recipient.userId) reason = "INVALID_RECIPIENT";
  else if (!intent.recipient.capabilityAuthorized) reason = "CAPABILITY_NOT_AUTHORIZED";
  else if (channel === "email" && !validEmail(intent.recipient.email)) reason = "INVALID_RECIPIENT";
  else if (channel === "sms" && !validPhone(intent.recipient.phone)) reason = "INVALID_RECIPIENT";
  else if (preferenceOutcome === "SUPPRESSED") reason = "PREFERENCE_DISABLED";
  else if (preferenceOutcome === "NOT_CONFIGURED") reason = "PURPOSE_DISABLED";
  else if (rateLimitOutcome === "RATE_LIMITED") reason = "RATE_LIMITED";
  else if (input.duplicate) reason = "DUPLICATE_DELIVERY";
  else if (mode === "SANDBOX") {
    sandboxActualRecipient = activation.sandboxEmailRecipient;
    sandboxOutcome = channel === "email" && validEmail(sandboxActualRecipient)
      && activation.sandboxEmailAllowlist.has(sandboxActualRecipient)
      ? "ALLOWED" : channel === "email" ? "RECIPIENT_NOT_ALLOWED" : "PROVIDER_UNAVAILABLE";
    if (sandboxOutcome === "RECIPIENT_NOT_ALLOWED") reason = "SANDBOX_RECIPIENT_NOT_ALLOWED";
    else if (sandboxOutcome === "PROVIDER_UNAVAILABLE") reason = "PROVIDER_UNAVAILABLE";
  }
  if (!reason && input.providerAvailable === false && (mode === "LIVE" || mode === "SANDBOX")) reason = "PROVIDER_UNAVAILABLE";

  return Object.freeze({
    decision: reason ? "SUPPRESS" : "ALLOW",
    reason,
    requestedMode: mode,
    effectiveMode: reason ? "DISABLED" : mode,
    preferenceOutcome,
    rateLimitOutcome,
    sandboxOutcome,
    sandboxActualRecipient,
    originalRecipientFingerprint,
  });
}

export function markSandboxEmail(input: {
  purpose: CommunicationPurpose;
  companyId: string;
  originalRecipientFingerprint: string;
  subject: string;
  text: string;
  html: string;
}) {
  const note = `[SANDBOX] purpose=${input.purpose}; company=${input.companyId}; original-recipient=${input.originalRecipientFingerprint.slice(0, 12)}`;
  return {
    subject: `[SANDBOX] ${input.subject}`,
    text: `${note}\n\n${input.text}`,
    html: `<p><strong>${note}</strong></p>${input.html}`,
  };
}

function defaultPreferenceOutcome(purpose: CommunicationPurpose, channel: CommunicationChannel): CommunicationPreferenceOutcome {
  if (purpose === "TRANSACTIONAL" || purpose === "SECURITY") return "NOT_APPLICABLE";
  if (purpose === "FINANCE" && channel === "email") return "NOT_APPLICABLE";
  if (purpose === "FINANCE" && channel === "in_app") return "ALLOWED";
  return "NOT_CONFIGURED";
}

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return validEmail(normalized) ? normalized : null;
}

function validEmail(value: string | null | undefined): value is string {
  return Boolean(value && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function validPhone(value: string | null | undefined): value is string {
  return Boolean(value && /^\+[1-9]\d{7,14}$/.test(value.replace(/[\s()-]/g, "")));
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
