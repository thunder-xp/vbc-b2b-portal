import "server-only";

import { createHash } from "node:crypto";

import type { RetailCheckoutRepository } from "../repositories/retail-checkout.repository";
import { RetailCheckoutRepositoryError } from "../repositories/supabase/retail-checkout.supabase-repository";
import type { PublicRetailLocale, RetailAddressDto } from "../types";

const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class RetailCheckoutInputError extends Error { constructor() { super("Invalid checkout input."); this.name = "RetailCheckoutInputError"; } }
export class RetailCheckoutConflictError extends Error { constructor() { super("Checkout state changed."); this.name = "RetailCheckoutConflictError"; } }
export class RetailCheckoutUnavailableError extends Error { constructor(readonly reason: string | null = null) { super("Checkout unavailable."); this.name = "RetailCheckoutUnavailableError"; } }

export type RetailCheckoutInput = {
  locale: PublicRetailLocale;
  checkoutFingerprint: string;
  submissionKey: string;
  name: string;
  phone: string;
  email?: string | null;
  deliveryAddress: { locality: string; street: string; building: string; unit?: string | null; postalCode?: string | null; instructions?: string | null };
  installationSameAsDelivery: boolean;
  installationAddress?: RetailCheckoutInput["deliveryAddress"] | null;
  processingAcknowledged: boolean;
};

export class RetailCheckoutService {
  constructor(private readonly repository: RetailCheckoutRepository) {}

  getCheckout(tokenHash: string | null, locale: PublicRetailLocale) {
    return tokenHash ? this.repository.getCheckout(validHash(tokenHash), locale) : Promise.resolve(null);
  }

  async createOrder(tokenHash: string, accessTokenHash: string, input: RetailCheckoutInput) {
    const customer = {
      name: boundedText(input.name, 2, 160),
      phone: normalizeMoldovaPhone(input.phone),
      email: optionalEmail(input.email),
      processingAcknowledged: true as const,
    };
    if (!input.processingAcknowledged || !UUID.test(input.submissionKey) || !HASH.test(input.checkoutFingerprint)) throw new RetailCheckoutInputError();
    const deliveryAddress = normalizeAddress(input.deliveryAddress);
    const installationAddress = input.installationSameAsDelivery ? null : input.installationAddress ? normalizeAddress(input.installationAddress) : null;
    const command = {
      locale: input.locale,
      checkoutFingerprint: input.checkoutFingerprint,
      submissionKey: input.submissionKey.toLowerCase(),
      accessTokenHash: validHash(accessTokenHash),
      customer,
      deliveryAddress,
      installationAddress,
    };
    const requestFingerprint = fingerprint({ locale: command.locale, checkoutFingerprint: command.checkoutFingerprint, customer, deliveryAddress, installationAddress });
    try {
      return await this.repository.createOrder(validHash(tokenHash), { ...command, requestFingerprint });
    } catch (error) {
      if (error instanceof RetailCheckoutRepositoryError && (error.code === "40001" || error.code === "23505")) throw new RetailCheckoutConflictError();
      if (error instanceof RetailCheckoutRepositoryError && (error.code === "P0002" || error.code === "28000")) throw new RetailCheckoutUnavailableError(error.detail);
      throw error;
    }
  }

  getOrder(accessTokenHash: string, locale: PublicRetailLocale) {
    return this.repository.getOrder(validHash(accessTokenHash), locale);
  }

  getInstallationStatus(accessTokenHash: string, locale: PublicRetailLocale) {
    return this.repository.getInstallationStatus(validHash(accessTokenHash), locale);
  }

  transitionInstallation(accessTokenHash: string, input: { command: "confirm" | "report_issue"; expectedRevision: number; category?: string | null; note?: string | null; idempotencyKey: string }) {
    const categories = new Set(["work_incomplete", "installation_quality", "equipment_issue", "schedule_service_issue", "other"]);
    const category = input.category?.trim() || null;
    const note = input.note?.trim() || null;
    if (!UUID.test(input.idempotencyKey) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || (note?.length ?? 0) > 500
      || (input.command === "report_issue" && (!category || !categories.has(category))) || (input.command === "confirm" && category !== null)) throw new RetailCheckoutInputError();
    return this.repository.transitionInstallation({ accessTokenHash: validHash(accessTokenHash), command: input.command, expectedRevision: input.expectedRevision, category, note, idempotencyKey: input.idempotencyKey });
  }
}

export function normalizeMoldovaPhone(value: string): string {
  const digits = value.replace(/[^0-9+]/g, "");
  const normalized = digits.startsWith("+373") ? digits : digits.startsWith("373") ? `+${digits}` : digits.startsWith("0") && digits.length === 9 ? `+373${digits.slice(1)}` : "";
  if (!/^\+373[0-9]{8}$/.test(normalized)) throw new RetailCheckoutInputError();
  return normalized;
}

function validHash(value: string) { if (!HASH.test(value)) throw new RetailCheckoutInputError(); return value; }
function boundedText(value: string, minimum: number, maximum: number) { const result = value.trim().replace(/\s+/g, " "); if (result.length < minimum || result.length > maximum) throw new RetailCheckoutInputError(); return result; }
function optionalText(value: string | null | undefined, maximum: number) { const result = value?.trim() || null; if (result && result.length > maximum) throw new RetailCheckoutInputError(); return result; }
function optionalEmail(value: string | null | undefined) { const result = value?.trim().toLowerCase() || null; if (result && (result.length > 254 || !EMAIL.test(result))) throw new RetailCheckoutInputError(); return result; }
function normalizeAddress(value: RetailCheckoutInput["deliveryAddress"]): RetailAddressDto { return { locality: boundedText(value.locality, 1, 120), street: boundedText(value.street, 1, 160), building: boundedText(value.building, 1, 40), unit: optionalText(value.unit, 80), postalCode: optionalText(value.postalCode, 20), instructions: optionalText(value.instructions, 500) }; }
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
