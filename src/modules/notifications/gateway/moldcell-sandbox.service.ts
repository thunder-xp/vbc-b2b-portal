import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { CommunicationIntent } from "./communication-intent";
import {
  CommunicationGatewayService,
  communicationRuntimePolicyFromEnvironment,
} from "./communication-gateway.service";
import { smsSandboxAllowlistFromEnvironment } from "./communication-policy.service";
import { CommunicationTemplateRegistry } from "./communication-template.registry";
import { DurableCommunicationService } from "./durable-communication.service";
import type { DurableCommunicationRepository } from "./durable-communication.repository";
import type { NotificationDeliveryRepository } from "./notification-delivery.repository";
import { NotificationDeliveryWorkerService } from "./notification-delivery-worker.service";
import {
  createMoldcellSmsChannelAdapter,
  moldcellConfigurationFromEnvironment,
  summarizeMoldcellConfiguration,
  type MoldcellConfigurationSummary,
} from "./moldcell-sms.provider";
import { maskPhone } from "./sms-phone";
import type { NotificationChannelAdapter } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_PREFIX = "NSD TEST: ";

export type MoldcellSmsStoredHealth = Readonly<{
  lastSandboxSuccess: string | null;
  lastFailure: string | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  acceptedCount: number;
  failedCount: number;
  retryCount: number;
  recipientLimitPerHour: number;
  companyLimitPerHour: number;
}>;

export interface MoldcellSmsHealthRepository {
  getHealth(): Promise<MoldcellSmsStoredHealth>;
}

export type MoldcellSmsReadiness = Readonly<{
  smsMode: "SANDBOX" | "DISABLED";
  configuration: MoldcellConfigurationSummary;
  allowedRecipients: readonly Readonly<{ token: string; maskedPhone: string }>[];
  identityConfigured: boolean;
  networkReachability: "PROVEN" | "FAILED" | "UNKNOWN";
  stored: MoldcellSmsStoredHealth;
}>;

export type MoldcellSandboxSendResult = Readonly<{
  deliveryId: string;
  attemptId: string | null;
  provider: string;
  normalizedPhone: string;
  providerStatus: "PROVIDER_ACCEPTED" | "FAILED" | "SUPPRESSED";
  providerCode: string | null;
  providerMessage: string | null;
  providerTimestamp: string | null;
  durationMs: number;
}>;

export class MoldcellSandboxError extends Error {
  constructor(readonly safeCode: string) {
    super("Moldcell sandbox operation failed.");
    this.name = "MoldcellSandboxError";
  }
}

export class MoldcellSandboxService {
  constructor(
    private readonly durableRepository: DurableCommunicationRepository,
    private readonly deliveryRepository: NotificationDeliveryRepository,
    private readonly healthRepository: MoldcellSmsHealthRepository,
    private readonly environment: Readonly<Record<string, string | undefined>> = process.env,
    private readonly providerFactory: (configuration: ReturnType<typeof moldcellConfigurationFromEnvironment>) => NotificationChannelAdapter
      = () => createMoldcellSmsChannelAdapter(this.environment),
  ) {}

  async getReadiness(): Promise<MoldcellSmsReadiness> {
    const stored = await this.healthRepository.getHealth();
    const configuration = summarizeMoldcellConfiguration(moldcellConfigurationFromEnvironment(this.environment));
    const recipients = sandboxRecipients(this.environment);
    return Object.freeze({
      smsMode: this.environment.SMS_MODE === "SANDBOX" ? "SANDBOX" : "DISABLED",
      configuration,
      allowedRecipients: recipients.map((phone) => Object.freeze({ token: fingerprint(phone), maskedPhone: maskPhone(phone) })),
      identityConfigured: UUID.test(this.environment.COMMUNICATION_SMS_SANDBOX_COMPANY_ID ?? "")
        && UUID.test(this.environment.COMMUNICATION_SMS_SANDBOX_USER_ID ?? ""),
      networkReachability: stored.lastSandboxSuccess ? "PROVEN" : stored.lastFailure ? "FAILED" : "UNKNOWN",
      stored,
    });
  }

  async sendSandbox(input: {
    operatorUserId: string;
    recipientToken: string;
    message: string;
  }): Promise<MoldcellSandboxSendResult> {
    const runtime = this.runtime(input.recipientToken);
    const renderedText = `${TEST_PREFIX}${input.message.trim()}`;
    if (!UUID.test(input.operatorUserId)
      || !input.message.trim()
      || [...renderedText].length > runtime.configuration.maxCharacters
      || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(renderedText)) {
      throw new MoldcellSandboxError("INVALID_TEST_MESSAGE");
    }
    const hourIdentity = new Date().toISOString().slice(0, 13);
    const idempotencyIdentity = `moldcell-sandbox:${input.operatorUserId}:${runtime.recipientToken}:${hourIdentity}`;
    const intent: CommunicationIntent = Object.freeze({
      intentId: idempotencyIdentity,
      purpose: "SUPPORT",
      businessEventType: "support.sms_sandbox_test",
      businessEntityReferences: Object.freeze([`operator:${input.operatorUserId}`]),
      companyId: runtime.companyId,
      recipient: Object.freeze({
        userId: runtime.recipientUserId,
        companyId: runtime.companyId,
        locale: "ru",
        phone: runtime.phone,
        email: null,
        identityVerified: true,
        membershipActive: true,
        capabilityAuthorized: true,
      }),
      templateKey: "moldcell.sms_sandbox_test",
      templateVersion: "v1",
      channelPolicy: Object.freeze({ sms: "SANDBOX" }),
      preferencePolicy: Object.freeze({ sms: "NOT_APPLICABLE" }),
      variables: Object.freeze({ message: input.message.trim() }),
      cta: Object.freeze({ label: "Internal diagnostic", target: "/admin/integrations/notifications" }),
      priority: "normal",
      scheduledBusinessDate: new Date().toISOString().slice(0, 10),
      correlationId: randomUUID(),
      idempotencyIdentity,
      sensitivity: "SECURITY_SENSITIVE",
    });
    const gateway = new CommunicationGatewayService(
      sandboxRegistry(),
      [],
      communicationRuntimePolicyFromEnvironment(this.environment),
    );
    const durable = await new DurableCommunicationService(gateway, this.durableRepository).persist(intent, ["sms"]);
    const delivery = durable.deliveries[0];
    if (!delivery || delivery.channelMode !== "SANDBOX" || !["READY", "QUEUED"].includes(delivery.state)) {
      throw new MoldcellSandboxError("SANDBOX_DELIVERY_NOT_READY");
    }
    const worker = new NotificationDeliveryWorkerService(
      this.deliveryRepository,
      [this.providerFactory(runtime.configuration)],
      { batchSize: 1, concurrency: 1, environment: this.environment },
    );
    const outcome = (await worker.runOne(delivery.deliveryId)).attempts?.[0];
    if (!outcome) throw new MoldcellSandboxError("SANDBOX_DELIVERY_NOT_CLAIMED");
    return Object.freeze({
      deliveryId: delivery.deliveryId,
      attemptId: outcome.attemptId,
      provider: outcome.provider ?? "moldcell",
      normalizedPhone: maskPhone(runtime.phone),
      providerStatus: outcome.providerStatus === "PROVIDER_ACCEPTED"
        ? "PROVIDER_ACCEPTED" : outcome.status === "suppressed" ? "SUPPRESSED" : "FAILED",
      providerCode: outcome.providerCode,
      providerMessage: outcome.providerMessage,
      providerTimestamp: outcome.providerTimestamp,
      durationMs: outcome.durationMs,
    });
  }

  private runtime(recipientToken: string) {
    if (this.environment.SMS_MODE !== "SANDBOX"
      || this.environment.COMMUNICATION_SMS_KILL_SWITCH !== "OFF"
      || this.environment.COMMUNICATION_OUTBOUND_KILL_SWITCH === "ON") {
      throw new MoldcellSandboxError("SMS_SANDBOX_DISABLED");
    }
    const configuration = moldcellConfigurationFromEnvironment(this.environment);
    if (!summarizeMoldcellConfiguration(configuration).configured) {
      throw new MoldcellSandboxError("MOLDCELL_NOT_CONFIGURED");
    }
    const companyId = this.environment.COMMUNICATION_SMS_SANDBOX_COMPANY_ID ?? "";
    const recipientUserId = this.environment.COMMUNICATION_SMS_SANDBOX_USER_ID ?? "";
    if (!UUID.test(companyId) || !UUID.test(recipientUserId)) {
      throw new MoldcellSandboxError("SANDBOX_IDENTITY_NOT_CONFIGURED");
    }
    const phone = sandboxRecipients(this.environment).find((candidate) => fingerprint(candidate) === recipientToken);
    if (!phone) throw new MoldcellSandboxError("SANDBOX_RECIPIENT_NOT_ALLOWED");
    return { configuration, companyId, recipientUserId, phone, recipientToken };
  }
}

function sandboxRegistry(): CommunicationTemplateRegistry {
  const registry = new CommunicationTemplateRegistry();
  for (const locale of ["ru", "ro"] as const) {
    registry.register({
      templateKey: "moldcell.sms_sandbox_test",
      templateVersion: "v1",
      locale,
      channel: "sms",
      render: (intent) => ({
        subject: "Moldcell sandbox test",
        textBody: `${TEST_PREFIX}${String(intent.variables.message ?? "").trim()}`,
        providerPayload: Object.freeze({ kind: "moldcell_sms_sandbox_test" }),
      }),
    });
  }
  return registry;
}

function sandboxRecipients(environment: Readonly<Record<string, string | undefined>>): string[] {
  return [...smsSandboxAllowlistFromEnvironment(environment)];
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
