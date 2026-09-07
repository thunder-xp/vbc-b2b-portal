export type CommunicationChannel = "email" | "in_app" | "sms";

export type CommunicationChannelMode = "DISABLED" | "DRY_RUN" | "LIVE";

export type CommunicationSensitivity =
  | "PUBLIC"
  | "PARTNER_PRIVATE"
  | "FINANCIAL_PRIVATE"
  | "SECURITY_SENSITIVE";

export type CommunicationLocale = "ru" | "ro";

export type CommunicationRecipient = Readonly<{
  userId: string;
  companyId: string;
  locale: CommunicationLocale;
  email?: string | null;
  phone?: string | null;
  identityVerified: boolean;
  membershipActive: boolean;
  capabilityAuthorized: boolean;
}>;

export type CommunicationIntent<TVariables extends Record<string, unknown> = Record<string, unknown>> = Readonly<{
  intentId: string;
  businessEventType: string;
  businessEntityReferences: readonly string[];
  companyId: string;
  recipient: CommunicationRecipient;
  templateKey: string;
  templateVersion: string;
  channelPolicy: Readonly<Partial<Record<CommunicationChannel, CommunicationChannelMode>>>;
  variables: Readonly<TVariables>;
  cta: Readonly<{ label: string; target: string }>;
  priority: "normal" | "high";
  scheduledBusinessDate: string;
  correlationId: string;
  idempotencyIdentity: string;
  sensitivity: CommunicationSensitivity;
}>;

export type CommunicationSuppressionReason =
  | "BUSINESS_ROLLOUT_HOLD"
  | "CAPABILITY_NOT_AUTHORIZED"
  | "CHANNEL_DISABLED"
  | "COMPANY_MISMATCH"
  | "DUPLICATE"
  | "GLOBAL_KILL_SWITCH"
  | "IDENTITY_NOT_VERIFIED"
  | "INACTIVE_MEMBERSHIP"
  | "INVALID_RECIPIENT"
  | "PER_CHANNEL_KILL_SWITCH"
  | "PREFERENCE_DISABLED"
  | "PROVIDER_UNAVAILABLE";

export type RenderedCommunication = Readonly<{
  subject: string;
  textBody: string;
  htmlBody?: string;
  providerPayload: Readonly<Record<string, unknown>>;
}>;

export type CommunicationProjection = Readonly<{
  intentId: string;
  deliveryIdentity: string;
  businessEventType: string;
  businessEntityReferences: readonly string[];
  companyId: string;
  recipient: CommunicationRecipient;
  channel: CommunicationChannel;
  mode: CommunicationChannelMode;
  templateKey: string;
  templateVersion: string;
  locale: CommunicationLocale;
  sensitivity: CommunicationSensitivity;
  scheduledBusinessDate: string;
  correlationId: string;
  state: "PROJECTED" | "SUPPRESSED" | "ACCEPTED";
  suppressionReason: CommunicationSuppressionReason | null;
  rendered: RenderedCommunication | null;
  providerRequestId: string | null;
}>;
