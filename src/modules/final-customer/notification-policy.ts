export type CustomerServiceNotificationMode = "DISABLED" | "DRY_RUN" | "SANDBOX" | "LIVE";

export const CUSTOMER_SERVICE_SMS_EVENTS = Object.freeze([
  "CUSTOMER_SERVICE_NEED_INFO",
  "CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH",
  "CUSTOMER_SERVICE_RESOLVED",
] as const);

export type CustomerServiceSmsEvent = typeof CUSTOMER_SERVICE_SMS_EVENTS[number];

export function customerServiceNotificationPolicy(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const requestedSmsMode = normalizeMode(environment.CUSTOMER_SERVICE_SMS_MODE);
  return Object.freeze({
    purpose: "CUSTOMER_SERVICE" as const,
    inApp: "ENABLED" as const,
    email: normalizeMode(environment.CUSTOMER_SERVICE_EMAIL_MODE),
    sms: environment.CUSTOMER_SERVICE_SMS_ENABLED === "true" ? requestedSmsMode : "DISABLED" as const,
  });
}

export function isCustomerServiceSmsEvent(value: string | null | undefined): value is CustomerServiceSmsEvent {
  return CUSTOMER_SERVICE_SMS_EVENTS.includes(value as CustomerServiceSmsEvent);
}

function normalizeMode(value: string | undefined): CustomerServiceNotificationMode {
  return ["DISABLED", "DRY_RUN", "SANDBOX", "LIVE"].includes(value ?? "")
    ? value as CustomerServiceNotificationMode : "DISABLED";
}
