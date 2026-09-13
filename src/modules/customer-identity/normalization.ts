import type { CustomerIdentityKeyType } from "./types";

export class CustomerIdentityNormalizationError extends Error {
  constructor(readonly keyType: CustomerIdentityKeyType) {
    super(`Invalid ${keyType.toLowerCase()} identity value.`);
    this.name = "CustomerIdentityNormalizationError";
  }
}

export function normalizeCustomerPhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) {
    throw new CustomerIdentityNormalizationError("PHONE");
  }
  return compact;
}

export function normalizeCustomerEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new CustomerIdentityNormalizationError("EMAIL");
  }
  return normalized;
}

export function normalizeCustomerLegalIdentifier(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s./-]/g, "");
  if (!/^[A-Z0-9]{2,32}$/.test(normalized)) {
    throw new CustomerIdentityNormalizationError("LEGAL_IDENTIFIER");
  }
  return normalized;
}
