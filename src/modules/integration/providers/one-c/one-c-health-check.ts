import type { OneCEnv } from "@/src/lib/env";

import {
  IntegrationProviderUnavailableError,
  IntegrationTimeoutError,
  IntegrationValidationError,
} from "../../errors";
import { createPartnerLookupService } from "../../services";
import { OneCODataClient } from "./one-c-odata-client";

const PARTNERS_RESOURCE = "Catalog_Контрагенты";
const MINIMAL_FIELDS = "Ref_Key,Code,Description,DeletionMark";
const NAME_SEARCH_FIELDS = [
  "Ref_Key",
  "Code",
  "Description",
  "НаименованиеПолное",
  "ИНН",
  "Покупатель",
  "Поставщик",
  "Недействителен",
  "DeletionMark",
  "IsFolder",
].join(",");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OneCHealthErrorCategory =
  | "configuration"
  | "timeout"
  | "transport"
  | "http"
  | "invalid_json"
  | "invalid_envelope"
  | "unknown";

export type OneCHealthCheck = {
  passed: boolean;
  statusCode: number | null;
  contentType: string | null;
  durationMs: number | null;
  hostname: string | null;
  errorCategory: OneCHealthErrorCategory | null;
  message: string | null;
};

export type OneCConfigurationHealth = {
  checks: { variable: string; configured: boolean }[];
  baseHost: string | null;
  authMode: string | null;
  timeoutMs: number | null;
};

export type OneCNameQueryHealth = OneCHealthCheck & {
  valueArray: boolean;
  rowCount: number;
  validMappedRowCount: number;
  skippedRowCount: number;
  validationFailures: { field: string; receivedType: string }[];
};

export type OneCHealthReport = {
  configuration: OneCConfigurationHealth;
  metadata: OneCHealthCheck;
  minimalQuery: OneCHealthCheck & {
    jsonParsed: boolean;
    valueArray: boolean;
    rowCount: number;
  };
  nameQuery: OneCNameQueryHealth;
  provider: {
    passed: boolean;
    resultCount: number;
    errorCategory: OneCHealthErrorCategory | null;
    message: string;
  };
};

export async function runOneCODataHealthCheck(oneCEnv: OneCEnv): Promise<OneCHealthReport> {
  const configuration = inspectConfiguration(oneCEnv);
  const client = new OneCODataClient(oneCEnv);

  const [metadata, minimalQuery, nameQuery, provider] = await Promise.all([
    runMetadataCheck(client),
    runMinimalQueryCheck(client),
    runNameQueryCheck(client),
    runProviderCheck(oneCEnv),
  ]);

  return { configuration, metadata, minimalQuery, nameQuery, provider };
}

function inspectConfiguration(oneCEnv: OneCEnv): OneCConfigurationHealth {
  const timeout = process.env.ONEC_TIMEOUT_MS;
  const parsedTimeout = timeout ? Number.parseInt(timeout, 10) : null;
  const baseHost = parseHostname(oneCEnv.baseUrl);
  const isProduction = process.env.NODE_ENV === "production";

  const result = {
    checks: [
      { variable: "ONEC_BASE_URL", configured: Boolean(oneCEnv.baseUrl) },
      { variable: "ONEC_USERNAME", configured: Boolean(oneCEnv.username) },
      { variable: "ONEC_PASSWORD", configured: Boolean(oneCEnv.password) },
      { variable: "ONEC_AUTH_MODE", configured: process.env.ONEC_AUTH_MODE === "basic" },
      {
        variable: "ONEC_TIMEOUT_MS",
        configured: parsedTimeout !== null && Number.isInteger(parsedTimeout) && parsedTimeout > 0,
      },
      {
        variable: "ONEC_USE_MOCK_PARTNERS",
        configured: !isProduction || process.env.ONEC_USE_MOCK_PARTNERS === "false",
      },
    ],
    baseHost,
    authMode: process.env.ONEC_AUTH_MODE ?? null,
    timeoutMs: parsedTimeout && parsedTimeout > 0 ? parsedTimeout : null,
  };

  if (result.checks.some((check) => !check.configured)) {
    logFailure("config", null, "configuration", safeMessage("configuration"), baseHost);
  }

  return result;
}

async function runMetadataCheck(client: OneCODataClient): Promise<OneCHealthCheck> {
  try {
    const result = await client.probe("$metadata");
    return fromProbe("metadata", result, result.statusCode >= 200 && result.statusCode < 300);
  } catch (error) {
    return failedCheck("metadata", error, null);
  }
}

async function runMinimalQueryCheck(
  client: OneCODataClient,
): Promise<OneCHealthReport["minimalQuery"]> {
  try {
    const result = await client.probe(PARTNERS_RESOURCE, {
      $format: "json",
      $top: "1",
      $select: MINIMAL_FIELDS,
    });
    const rows = valueRows(result.payload);
    const valueArray = rows !== null;
    const rowCount = rows?.length ?? 0;
    const passed = result.statusCode >= 200 && result.statusCode < 300 && result.jsonParsed && valueArray;
    return { ...fromProbe("minimal_query", result, passed), jsonParsed: result.jsonParsed, valueArray, rowCount };
  } catch (error) {
    return { ...failedCheck("minimal_query", error, null), jsonParsed: false, valueArray: false, rowCount: 0 };
  }
}

async function runNameQueryCheck(client: OneCODataClient): Promise<OneCNameQueryHealth> {
  try {
    const result = await client.probe(PARTNERS_RESOURCE, {
      $format: "json",
      $top: "20",
      $select: NAME_SEARCH_FIELDS,
      $filter: "substringof('NOVOTECH',Description) eq true",
    });
    const valueRowsResult = valueRows(result.payload);
    const valueArray = valueRowsResult !== null;
    const rows = valueRowsResult ?? [];
    const diagnostics = rows.map(inspectPartnerRow);
    const validationFailures = diagnostics.flatMap((item) => item.validationFailures);
    const passed = result.statusCode >= 200 && result.statusCode < 300 && result.jsonParsed && valueArray;
    return {
      ...fromProbe("name_query", result, passed),
      valueArray,
      rowCount: rows.length,
      validMappedRowCount: diagnostics.filter((item) => item.valid).length,
      skippedRowCount: diagnostics.filter((item) => !item.valid).length,
      validationFailures,
    };
  } catch (error) {
    return {
      ...failedCheck("name_query", error, null),
      valueArray: false,
      rowCount: 0,
      validMappedRowCount: 0,
      skippedRowCount: 0,
      validationFailures: [],
    };
  }
}

async function runProviderCheck(oneCEnv: OneCEnv): Promise<OneCHealthReport["provider"]> {
  try {
    const result = await createPartnerLookupService(oneCEnv).searchPartners({ query: "NOVOTECH", limit: 20 });
    return { passed: true, resultCount: result.items.length, errorCategory: null, message: "Provider lookup completed." };
  } catch (error) {
    const errorCategory = categorizeOneCHealthError(error);
    const message = safeMessage(errorCategory);
    logFailure("provider", null, errorCategory, message, parseHostname(oneCEnv.baseUrl));
    return { passed: false, resultCount: 0, errorCategory, message };
  }
}

function fromProbe(
  stage: "metadata" | "minimal_query" | "name_query",
  result: Awaited<ReturnType<OneCODataClient["probe"]>>,
  passed: boolean,
): OneCHealthCheck {
  const errorCategory: OneCHealthErrorCategory | null = passed
    ? null
    : result.jsonParsed
      ? "http"
      : "invalid_json";
  const message = errorCategory ? safeMessage(errorCategory) : null;
  if (errorCategory) {
    logFailure(stage, result.statusCode, errorCategory, safeMessage(errorCategory), result.hostname);
  }
  return {
    passed,
    statusCode: result.statusCode,
    contentType: result.contentType,
    durationMs: result.durationMs,
    hostname: result.hostname,
    errorCategory,
    message,
  };
}

function failedCheck(
  stage: "metadata" | "minimal_query" | "name_query",
  error: unknown,
  baseHost: string | null,
): OneCHealthCheck {
  const errorCategory = categorizeOneCHealthError(error);
  const message = safeMessage(errorCategory);
  logFailure(stage, null, errorCategory, message, baseHost);
  return { passed: false, statusCode: null, contentType: null, durationMs: null, hostname: baseHost, errorCategory, message };
}

function inspectPartnerRow(value: unknown): { valid: boolean; validationFailures: { field: string; receivedType: string }[] } {
  if (!isRecord(value)) return { valid: false, validationFailures: [{ field: "row", receivedType: receivedType(value) }] };
  const validationFailures = [
    validateNullableString(value, "Code"),
    validateNullableString(value, "Description"),
    validateNullableString(value, "НаименованиеПолное"),
    validateNullableString(value, "ИНН"),
    validateNullableBoolean(value, "Покупатель"),
    validateNullableBoolean(value, "Поставщик"),
    validateNullableBoolean(value, "Недействителен"),
    validateNullableBoolean(value, "DeletionMark"),
    validateNullableBoolean(value, "IsFolder"),
  ].filter((item): item is { field: string; receivedType: string } => item !== null);
  const reference = value.Ref_Key;
  if (typeof reference !== "string" || !UUID_PATTERN.test(reference.trim())) {
    validationFailures.push({ field: "Ref_Key", receivedType: receivedType(reference) });
  }
  const description = typeof value.Description === "string" ? value.Description.trim() : "";
  const folder = value.IsFolder === true;
  const deleted = value.DeletionMark === true;
  const inactive = value.Недействителен === true;
  return { valid: validationFailures.length === 0 && !folder && !deleted && !inactive && description.length > 0, validationFailures };
}

function validateNullableString(value: Record<string, unknown>, field: string) {
  const item = value[field];
  return item === undefined || item === null || typeof item === "string" ? null : { field, receivedType: receivedType(item) };
}

function validateNullableBoolean(value: Record<string, unknown>, field: string) {
  const item = value[field];
  return item === undefined || item === null || typeof item === "boolean" ? null : { field, receivedType: receivedType(item) };
}

function valueRows(value: unknown): unknown[] | null {
  return isRecord(value) && Array.isArray(value.value) ? value.value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function receivedType(value: unknown): string {
  return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
}

export function categorizeOneCHealthError(error: unknown): OneCHealthErrorCategory {
  if (error instanceof IntegrationTimeoutError) return "timeout";
  if (error instanceof IntegrationProviderUnavailableError) return "transport";
  if (error instanceof IntegrationValidationError) return "invalid_envelope";
  return "unknown";
}

function safeMessage(category: OneCHealthErrorCategory): string {
  const messages: Record<OneCHealthErrorCategory, string> = {
    configuration: "1C OData configuration is incomplete.",
    timeout: "1C request timed out.",
    transport: "1C transport is unavailable.",
    http: "1C returned a non-success HTTP status.",
    invalid_json: "1C response was not valid JSON.",
    invalid_envelope: "1C response envelope was invalid.",
    unknown: "1C diagnostic failed unexpectedly.",
  };
  return messages[category];
}

function parseHostname(baseUrl: string | null): string | null {
  try {
    return baseUrl ? new URL(baseUrl).hostname : null;
  } catch {
    return null;
  }
}

function logFailure(
  stage: "config" | "metadata" | "minimal_query" | "name_query" | "provider",
  statusCode: number | null,
  errorCategory: OneCHealthErrorCategory,
  message: string,
  baseHost: string | null,
): void {
  console.error({ event: "one_c_health_check_failed", stage, statusCode, errorCategory, message, baseHost });
}
