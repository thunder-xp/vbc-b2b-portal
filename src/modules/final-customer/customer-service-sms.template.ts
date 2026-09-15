import type { CommunicationLocale, CommunicationTemplateRegistry } from "@/src/modules/notifications/gateway";

import type { CustomerServiceSmsEvent } from "./notification-policy";

export const CUSTOMER_SERVICE_SMS_TEMPLATE_VERSION = "v1" as const;

const DEFINITIONS: Readonly<Record<CustomerServiceSmsEvent, Readonly<{
  eventType: string;
  templateKey: string;
  copy: Readonly<Record<CommunicationLocale, string>>;
}>>> = Object.freeze({
  CUSTOMER_SERVICE_NEED_INFO: Object.freeze({
    eventType: "customer_service.need_info",
    templateKey: "customer_service.need_info_sms",
    copy: Object.freeze({
      ru: "NSD: Нужна информация по обращению. Откройте личный кабинет.",
      ro: "NSD: Sunt necesare informații. Deschideți cabinetul personal.",
    }),
  }),
  CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH: Object.freeze({
    eventType: "customer_service.reply_from_novotech",
    templateKey: "customer_service.reply_sms",
    copy: Object.freeze({
      ru: "NSD: Мы ответили на обращение. Подробности в личном кабинете.",
      ro: "NSD: Am răspuns solicitării. Detalii în cabinetul personal.",
    }),
  }),
  CUSTOMER_SERVICE_RESOLVED: Object.freeze({
    eventType: "customer_service.resolved",
    templateKey: "customer_service.resolved_sms",
    copy: Object.freeze({
      ru: "NSD: Обращение отмечено решённым. Подробности в личном кабинете.",
      ro: "NSD: Solicitarea este rezolvată. Detalii în cabinetul personal.",
    }),
  }),
});

export function customerServiceSmsDefinition(eventCode: CustomerServiceSmsEvent) {
  return DEFINITIONS[eventCode];
}

export function registerCustomerServiceSmsTemplates(registry: CommunicationTemplateRegistry) {
  for (const eventCode of Object.keys(DEFINITIONS) as CustomerServiceSmsEvent[]) {
    const definition = DEFINITIONS[eventCode];
    for (const locale of ["ru", "ro"] as const) {
      registry.register({
        templateKey: definition.templateKey,
        templateVersion: CUSTOMER_SERVICE_SMS_TEMPLATE_VERSION,
        locale,
        channel: "sms",
        render: () => Object.freeze({
          subject: "NSD Customer Service",
          textBody: definition.copy[locale],
          providerPayload: Object.freeze({ kind: "customer_service_status", eventCode }),
        }),
      });
    }
  }
  return registry;
}
