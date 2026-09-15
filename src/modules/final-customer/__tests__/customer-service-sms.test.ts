import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { DurableCommunicationRepository } from "@/src/modules/notifications/gateway";

import { CustomerServiceSmsNotificationService } from "../customer-service-sms.service";
import { customerServiceSmsDefinition, registerCustomerServiceSmsTemplates } from "../customer-service-sms.template";
import { CommunicationTemplateRegistry } from "@/src/modules/notifications/gateway";

const eventId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const accountId = "33333333-3333-4333-8333-333333333333";
const authUserId = "44444444-4444-4444-8444-444444444444";
const phone = "+37369000000";
const environment = {
  SMS_MODE: "SANDBOX",
  COMMUNICATION_SMS_KILL_SWITCH: "OFF",
  CUSTOMER_SERVICE_SMS_ENABLED: "true",
  CUSTOMER_SERVICE_SMS_MODE: "SANDBOX",
  SMS_SANDBOX_ALLOWED_RECIPIENTS: phone,
};

describe("Customer Service SMS sandbox", () => {
  it.each([
    "CUSTOMER_SERVICE_NEED_INFO",
    "CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH",
    "CUSTOMER_SERVICE_RESOLVED",
  ] as const)("projects %s once through the durable CUSTOMER_SERVICE intent", async (eventCode) => {
    const persist = vi.fn<DurableCommunicationRepository["persist"]>().mockImplementation(async (intent, projections) => ({
      intentId: intent.intentId,
      eventId,
      deliveries: projections.map((projection) => ({
        deliveryId: "55555555-5555-4555-8555-555555555555",
        deliveryIdentity: projection.deliveryIdentity,
        channel: projection.channel,
        channelMode: projection.mode,
        state: projection.state === "SUPPRESSED" ? "SUPPRESSED" : "READY",
      })),
    }));
    const recipients = { findByEvent: vi.fn(async () => ({
      requestId, eventId, eventCode, customerAccountId: accountId,
      authUserId, verifiedPhone: phone, locale: "ru" as const,
    })) };
    const service = new CustomerServiceSmsNotificationService(recipients, { persist }, environment);

    await service.project({ eventId, eventCode });
    await service.project({ eventId, eventCode });

    const [firstIntent, firstProjection] = persist.mock.calls[0];
    const [secondIntent, secondProjection] = persist.mock.calls[1];
    expect(firstIntent).toMatchObject({
      purpose: "CUSTOMER_SERVICE", companyId: null, customerAccountId: accountId,
      idempotencyIdentity: `customer-service:${eventId}`,
      recipient: { userId: authUserId, phone, companyId: null, customerAccountId: accountId },
    });
    expect(firstIntent.businessEventType).toBe(customerServiceSmsDefinition(eventCode).eventType);
    expect(firstProjection[0]).toMatchObject({ state: "PROJECTED", mode: "SANDBOX", sandboxOutcome: "ALLOWED" });
    expect(secondIntent.intentId).toBe(firstIntent.intentId);
    expect(secondProjection[0]?.deliveryIdentity).toBe(firstProjection[0]?.deliveryIdentity);
  });

  it("fails a non-allowlisted verified customer phone closed before delivery", async () => {
    const persist = vi.fn<DurableCommunicationRepository["persist"]>().mockImplementation(async (intent, projections) => ({
      intentId: intent.intentId, eventId, deliveries: projections.map((projection) => ({
        deliveryId: "55555555-5555-4555-8555-555555555555",
        deliveryIdentity: projection.deliveryIdentity, channel: projection.channel,
        channelMode: projection.mode, state: "SUPPRESSED" as const,
      })),
    }));
    const service = new CustomerServiceSmsNotificationService({ findByEvent: async () => ({
      requestId, eventId, eventCode: "CUSTOMER_SERVICE_NEED_INFO", customerAccountId: accountId,
      authUserId, verifiedPhone: "+37368000000", locale: "ru",
    }) }, { persist }, environment);
    await service.project({ eventId, eventCode: "CUSTOMER_SERVICE_NEED_INFO" });
    expect(persist.mock.calls[0][1][0]).toMatchObject({
      state: "SUPPRESSED", suppressionReason: "SANDBOX_RECIPIENT_NOT_ALLOWED",
    });
  });

  it("does not create SMS intent for routine or internal events, or while disabled", async () => {
    const persist = vi.fn<DurableCommunicationRepository["persist"]>();
    const recipients = { findByEvent: vi.fn() };
    const disabled = new CustomerServiceSmsNotificationService(recipients, { persist }, {});
    await disabled.project({ eventId, eventCode: "CUSTOMER_SERVICE_NEED_INFO" });
    await disabled.project({ eventId, eventCode: "CUSTOMER_SERVICE_STATUS_CHANGED" });
    await disabled.project({ eventId, eventCode: "INTERNAL_NOTE_ADDED" });
    expect(recipients.findByEvent).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("renders bounded privacy-safe RU and RO copy without service details", () => {
    const registry = registerCustomerServiceSmsTemplates(new CommunicationTemplateRegistry());
    for (const eventCode of [
      "CUSTOMER_SERVICE_NEED_INFO",
      "CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH",
      "CUSTOMER_SERVICE_RESOLVED",
    ] as const) {
      const definition = customerServiceSmsDefinition(eventCode);
      for (const locale of ["ru", "ro"] as const) {
        const text = registry.render({
          intentId: "test", purpose: "CUSTOMER_SERVICE", businessEventType: definition.eventType,
          businessEntityReferences: ["request:test"], companyId: null, customerAccountId: accountId,
          recipient: { userId: authUserId, companyId: null, customerAccountId: accountId, locale,
            phone, identityVerified: true, membershipActive: false, audienceActive: true, capabilityAuthorized: true },
          templateKey: definition.templateKey, templateVersion: "v1", channelPolicy: { sms: "SANDBOX" },
          variables: {}, cta: { label: "Open", target: "/account/service/test" }, priority: "normal",
          scheduledBusinessDate: "2026-09-15", correlationId: eventId,
          idempotencyIdentity: `customer-service:${eventId}`, sensitivity: "CUSTOMER_PRIVATE",
        }, "sms").textBody;
        expect([...text].length).toBeLessThanOrEqual(70);
        expect(text).not.toMatch(/customer|serial|order|заказ|серийн|описан|телефон|\+373|lei|MDL/i);
      }
    }
  });
});

describe("Customer Service SMS migration contract", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260915093248_final_customer_service_sms_sandbox_v1.sql"), "utf8");

  it("adds a customer-account audience without manufacturing a partner company", () => {
    expect(sql).toContain("customer_account_id uuid null references public.customer_accounts");
    expect(sql).toContain("company_id is null and customer_account_id is not null");
    expect(sql).toContain("recipient_auth_user_id uuid null references auth.users");
    expect(sql).toContain("verified customer phone");
  });

  it("keeps privileged recipient lookup and persistence service-only", () => {
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(sql).toContain("revoke all on function public.get_customer_service_sms_recipient_context(uuid) from public,anon,authenticated");
    expect(sql).toContain("revoke all on function public.persist_customer_service_sms_intent(jsonb,jsonb) from public,anon,authenticated");
  });

  it("uses source event identity, one durable delivery, and bounded customer-specific rate policy", () => {
    expect(sql).toContain("customer-service-sms:");
    expect(sql).toContain("on conflict(delivery_identity,channel_mode) do nothing");
    expect(sql).toContain("v_event.communication_purpose='CUSTOMER_SERVICE'");
    expect(sql).toContain("v_recipient_limit:=3; v_audience_limit:=10");
  });
});
