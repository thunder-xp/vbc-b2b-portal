import "server-only";

import type { CommunicationIntent } from "@/src/modules/notifications/gateway";
import {
  CommunicationGatewayService,
  CommunicationTemplateRegistry,
  DurableCommunicationService,
  SupabaseDurableCommunicationRepository,
  communicationRuntimePolicyFromEnvironment,
} from "@/src/modules/notifications/gateway";

import {
  CUSTOMER_SERVICE_SMS_TEMPLATE_VERSION,
  customerServiceSmsDefinition,
  registerCustomerServiceSmsTemplates,
} from "./customer-service-sms.template";
import {
  SupabaseCustomerServiceSmsRecipientRepository,
  type CustomerServiceSmsRecipientRepository,
} from "./customer-service-sms.repository";
import {
  customerServiceNotificationPolicy,
  isCustomerServiceSmsEvent,
  type CustomerServiceSmsEvent,
} from "./notification-policy";

export type CustomerServiceSmsProjectionResult = Readonly<{
  state: "SKIPPED" | "PERSISTED";
  deliveryId: string | null;
  eventCode: CustomerServiceSmsEvent | null;
}>;

export class CustomerServiceSmsNotificationService {
  constructor(
    private readonly recipients: CustomerServiceSmsRecipientRepository,
    private readonly durable = new SupabaseDurableCommunicationRepository(),
    private readonly environment: Readonly<Record<string, string | undefined>> = process.env,
  ) {}

  async project(input: Readonly<{ eventId: string | null; eventCode: string | null }>): Promise<CustomerServiceSmsProjectionResult> {
    if (!input.eventId || !isCustomerServiceSmsEvent(input.eventCode)) return skipped();
    const channelPolicy = customerServiceNotificationPolicy(this.environment);
    if (channelPolicy.sms !== "SANDBOX") return skipped(input.eventCode);
    const recipient = await this.recipients.findByEvent(input.eventId);
    if (!recipient || recipient.eventCode !== input.eventCode) return skipped(input.eventCode);

    const definition = customerServiceSmsDefinition(input.eventCode);
    const identity = `customer-service:${recipient.eventId}`;
    const intent: CommunicationIntent = Object.freeze({
      intentId: `customer-service-sms:${recipient.eventId}`,
      purpose: "CUSTOMER_SERVICE",
      businessEventType: definition.eventType,
      businessEntityReferences: Object.freeze([
        `customer-service-request:${recipient.requestId}`,
        `customer-service-event:${recipient.eventId}`,
      ]),
      companyId: null,
      customerAccountId: recipient.customerAccountId,
      recipient: Object.freeze({
        userId: recipient.authUserId,
        companyId: null,
        customerAccountId: recipient.customerAccountId,
        locale: recipient.locale,
        phone: recipient.verifiedPhone,
        email: null,
        identityVerified: true,
        membershipActive: false,
        audienceActive: true,
        capabilityAuthorized: true,
      }),
      templateKey: definition.templateKey,
      templateVersion: CUSTOMER_SERVICE_SMS_TEMPLATE_VERSION,
      channelPolicy: Object.freeze({ sms: "SANDBOX" }),
      preferencePolicy: Object.freeze({ sms: "NOT_APPLICABLE" }),
      variables: Object.freeze({ eventCode: input.eventCode }),
      cta: Object.freeze({ label: "Open customer service", target: `/account/service/${recipient.requestId}` }),
      priority: input.eventCode === "CUSTOMER_SERVICE_NEED_INFO" ? "high" : "normal",
      scheduledBusinessDate: new Date().toISOString().slice(0, 10),
      correlationId: recipient.eventId,
      idempotencyIdentity: identity,
      sensitivity: "CUSTOMER_PRIVATE",
    });
    const registry = registerCustomerServiceSmsTemplates(new CommunicationTemplateRegistry());
    const gateway = new CommunicationGatewayService(
      registry,
      [],
      communicationRuntimePolicyFromEnvironment(this.environment),
    );
    const persisted = await new DurableCommunicationService(gateway, this.durable).persist(intent, ["sms"]);
    return Object.freeze({
      state: "PERSISTED",
      deliveryId: persisted.deliveries[0]?.deliveryId ?? null,
      eventCode: input.eventCode,
    });
  }
}

export function createCustomerServiceSmsNotificationService() {
  return new CustomerServiceSmsNotificationService(new SupabaseCustomerServiceSmsRecipientRepository());
}

function skipped(eventCode: CustomerServiceSmsEvent | null = null): CustomerServiceSmsProjectionResult {
  return Object.freeze({ state: "SKIPPED", deliveryId: null, eventCode });
}
