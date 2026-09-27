import Decimal from "decimal.js";

import type { OneCCommercialRatesEnv } from "@/src/lib/env";
import { IntegrationTimeoutError, IntegrationValidationError } from "../../errors";
import { parseOneCChisinauTimestamp } from "./one-c-datetime";

export const ONE_C_COMMERCIAL_RATE_SOURCE = "РегистрСведений.КурсыВалют" as const;
export const ONE_C_BCRU_CODE = "113" as const;
export const ONE_C_RETAIL_CODE = "999" as const;
export const ONE_C_BCRU_REF = "d5303dea-f2f5-11ec-4f83-7239d3b7bd5c" as const;
export const ONE_C_RETAIL_REF = "94f0e33e-45d7-11ea-8111-000c29cf9dd4" as const;

export type CommercialRatePurpose = "partner_price_usd_to_mdl" | "retail_price_usd_to_mdl";
export type CommercialRateSourceDTO = {
  purpose: CommercialRatePurpose;
  currencyReference: string;
  code: "113" | "999";
  symbolicCode: string;
  rate: string;
  multiplicity: string;
  normalizedRate: string;
  effectiveAt: string;
  dataVersion: string;
};
export type OneCCommercialRateSnapshot = { generatedAt: string; rates: [CommercialRateSourceDTO, CommercialRateSourceDTO] };
export interface ExchangeRateProvider { fetchCommercialRates(): Promise<OneCCommercialRateSnapshot>; }

export class OneCExchangeRateSourceError extends Error {
  constructor(readonly category: "AUTH" | "TIMEOUT" | "HTTP" | "INVALID_RESPONSE", cause?: unknown) {
    super(`1C commercial-rate source failed: ${category}.`, { cause });
    this.name = "OneCExchangeRateSourceError";
  }
}

export class OneCExchangeRateProvider implements ExchangeRateProvider {
  constructor(
    private readonly config: OneCCommercialRatesEnv,
    private readonly now: () => Date = () => new Date(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async fetchCommercialRates(): Promise<OneCCommercialRateSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const response = await this.fetcher(this.config.endpointUrl, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`, "utf8").toString("base64")}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new OneCExchangeRateSourceError(response.status === 401 || response.status === 403 ? "AUTH" : "HTTP");
      }
      return parseCommercialRatePayload(await response.json(), this.now());
    } catch (error) {
      if (error instanceof OneCExchangeRateSourceError) throw error;
      if (error instanceof IntegrationValidationError) throw new OneCExchangeRateSourceError("INVALID_RESPONSE", error);
      if (error instanceof Error && error.name === "AbortError") {
        throw new OneCExchangeRateSourceError("TIMEOUT", new IntegrationTimeoutError("1C commercial-rate request timed out."));
      }
      throw new OneCExchangeRateSourceError("HTTP", error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function parseCommercialRatePayload(payload: unknown, now = new Date()): OneCCommercialRateSnapshot {
  if (!isRecord(payload) || typeof payload.generatedAt !== "string" || !Array.isArray(payload.rates)) {
    throw new IntegrationValidationError("1C commercial-rate response is invalid.");
  }
  const generatedAt = validTimestamp(payload.generatedAt, now, "generatedAt");
  const rates = payload.rates.map((value) => parseRate(value, now));
  if (rates.length !== 2 || new Set(rates.map((rate) => rate.code)).size !== 2
    || !rates.some((rate) => rate.code === ONE_C_BCRU_CODE)
    || !rates.some((rate) => rate.code === ONE_C_RETAIL_CODE)) {
    throw new IntegrationValidationError("1C must return exact commercial-rate codes 113 and 999.");
  }
  rates.sort((left, right) => left.code.localeCompare(right.code));
  return { generatedAt, rates: rates as [CommercialRateSourceDTO, CommercialRateSourceDTO] };
}

function parseRate(value: unknown, now: Date): CommercialRateSourceDTO {
  if (!isRecord(value)) throw new IntegrationValidationError("1C commercial-rate item is invalid.");
  const code = value.code === ONE_C_BCRU_CODE || value.code === ONE_C_RETAIL_CODE ? value.code : null;
  if (!code) throw new IntegrationValidationError("Unsupported 1C commercial-rate code.");
  const expected = code === ONE_C_BCRU_CODE
    ? { purpose: "partner_price_usd_to_mdl" as const, reference: ONE_C_BCRU_REF, symbol: "BCRU" }
    : { purpose: "retail_price_usd_to_mdl" as const, reference: ONE_C_RETAIL_REF, symbol: "BCR" };
  const currencyReference = text(value.currencyRef ?? value.currencyReference);
  const symbolicCode = text(value.symbolicCode);
  const rate = decimalText(value.rate);
  const multiplicity = decimalText(value.multiplicity);
  const normalizedRate = decimalText(value.normalizedRate);
  const dataVersion = text(value.dataVersion);
  if (currencyReference.toLowerCase() !== expected.reference || symbolicCode.toUpperCase() !== expected.symbol
    || !dataVersion || dataVersion.length > 256
    || !new Decimal(rate).div(multiplicity).toDecimalPlaces(8).equals(new Decimal(normalizedRate))) {
    throw new IntegrationValidationError(`1C commercial-rate evidence for ${code} is inconsistent.`);
  }
  return {
    purpose: expected.purpose, currencyReference, code, symbolicCode, rate, multiplicity, normalizedRate,
    effectiveAt: validEffectiveDate(value.effectiveAt, now), dataVersion,
  };
}

function decimalText(value: unknown): string {
  const raw = typeof value === "string" || typeof value === "number" ? String(value) : "";
  try {
    const parsed = new Decimal(raw);
    if (!parsed.isFinite() || parsed.lte(0) || parsed.decimalPlaces() > 8) throw new Error();
    return parsed.toFixed(parsed.decimalPlaces());
  } catch { throw new IntegrationValidationError("1C commercial-rate numeric value is invalid."); }
}
function validTimestamp(value: unknown, now: Date, field: string): string {
  const normalized = parseOneCChisinauTimestamp(value);
  const timestamp = normalized ? Date.parse(normalized) : Number.NaN;
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() + 5 * 60_000) {
    throw new IntegrationValidationError(`1C ${field} is invalid.`);
  }
  return normalized!;
}
function validEffectiveDate(value: unknown, now: Date): string {
  const date = typeof value === "string"
    ? value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1]
    : null;
  const normalized = date ? `${date}T00:00:00.000Z` : "";
  const timestamp = Date.parse(normalized);
  if (!date || !Number.isFinite(timestamp) || timestamp > now.getTime() + 5 * 60_000) {
    throw new IntegrationValidationError("1C effectiveAt is invalid.");
  }
  return normalized;
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
