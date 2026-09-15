export type CustomerServiceNotificationMode = "DISABLED" | "DRY_RUN" | "SANDBOX" | "LIVE";

export function customerServiceNotificationPolicy(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const requestedSmsMode = normalizeMode(environment.CUSTOMER_SERVICE_SMS_MODE);
  return Object.freeze({
    purpose: "CUSTOMER_SERVICE" as const,
    inApp: "ENABLED" as const,
    email: normalizeMode(environment.CUSTOMER_SERVICE_EMAIL_MODE),
    sms: environment.CUSTOMER_SERVICE_SMS_ENABLED === "true" ? requestedSmsMode : "DISABLED" as const,
  });
}

function normalizeMode(value: string | undefined): CustomerServiceNotificationMode {
  return ["DISABLED", "DRY_RUN", "SANDBOX", "LIVE"].includes(value ?? "")
    ? value as CustomerServiceNotificationMode : "DISABLED";
}
