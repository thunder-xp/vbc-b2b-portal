import "server-only";

import type { OneCEnv } from "@/src/lib/env";
import {
  OneCODataClient,
  type OneCODataMetadataContractResult,
} from "@/src/modules/integration/providers/one-c/one-c-odata-client";

import type {
  FinalCustomerCandidate,
  FinalCustomerMasterProvider,
  FinalCustomerProvisioningRequest,
} from "./external-types";

export const ONE_C_FINAL_CUSTOMER_RESOURCE = "Catalog_Контрагенты";
export const ONE_C_FINAL_CUSTOMER_PROPERTIES = [
  "Ref_Key", "Description", "НаименованиеПолное", "ВидКонтрагента", "Покупатель",
  "Поставщик", "Недействителен", "DeletionMark", "IsFolder", "Телефон",
  "ЭлектроннаяПочта", "Комментарий",
] as const;
const SELECT = ONE_C_FINAL_CUSTOMER_PROPERTIES.join(",");
const MARKER_PREFIX = "NOVOTECH_FINAL_CUSTOMER:";

export type OneCFinalCustomerContractAudit = Readonly<{
  passed: boolean;
  entitySet: string;
  entityType: string | null;
  presentProperties: string[];
  missingProperties: string[];
  statusCode: number;
  durationMs: number;
}>;

export class OneCFinalCustomerProvider implements FinalCustomerMasterProvider {
  private readonly client: OneCODataClient;
  private contractPromise: Promise<OneCODataMetadataContractResult> | null = null;

  constructor(config: OneCEnv) {
    this.client = new OneCODataClient(config);
  }

  async auditContract(): Promise<OneCFinalCustomerContractAudit> {
    const result = await this.contract();
    return {
      passed: result.missingEntitySets.length === 0 && result.missingProperties.length === 0,
      entitySet: result.entitySet,
      entityType: result.entityType,
      presentProperties: result.presentProperties,
      missingProperties: result.missingProperties,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
    };
  }

  async findCandidates(request: FinalCustomerProvisioningRequest) {
    await this.requireContract();
    const startedAt = performance.now();
    const filters = [`Телефон eq '${escapeLiteral(request.verifiedPhone)}'`];
    if (request.email) filters.push(`ЭлектроннаяПочта eq '${escapeLiteral(request.email)}'`);
    const rows = new Map<string, FinalCustomerCandidate>();
    for (const filter of filters) {
      for (const candidate of parseRows(await this.client.getFilteredCollection(
        ONE_C_FINAL_CUSTOMER_RESOURCE,
        { select: SELECT, filter, top: 20 },
        { requestKind: "final_customer_candidate_lookup" },
      ))) rows.set(candidate.externalId, candidate);
    }
    return { value: [...rows.values()], requestCount: filters.length + 1, durationMs: elapsed(startedAt) };
  }

  async findByOperationKey(request: FinalCustomerProvisioningRequest) {
    await this.requireContract();
    const startedAt = performance.now();
    const marker = operationMarker(request.operationKey);
    const value = parseRows(await this.client.getFilteredCollection(
      ONE_C_FINAL_CUSTOMER_RESOURCE,
      { select: SELECT, filter: `substringof('${escapeLiteral(marker)}',Комментарий) eq true`, top: 5 },
      { requestKind: "final_customer_create_reconciliation" },
    ));
    return { value, requestCount: 2, durationMs: elapsed(startedAt) };
  }

  async create(request: FinalCustomerProvisioningRequest) {
    await this.requireContract();
    if (process.env.ONE_C_CUSTOMER_WRITE_READY !== "true") throw codeError("ONE_C_CUSTOMER_WRITE_NOT_READY");
    if (request.customerKind !== "PERSON") throw codeError("UNSUPPORTED_CUSTOMER_KIND");
    const startedAt = performance.now();
    const payload: Record<string, unknown> = {
      Description: request.displayName,
      НаименованиеПолное: request.displayName,
      ВидКонтрагента: "ФизическоеЛицо",
      Покупатель: true,
      Поставщик: false,
      Недействителен: false,
      Телефон: request.verifiedPhone,
      Комментарий: operationMarker(request.operationKey),
    };
    if (request.email) payload.ЭлектроннаяПочта = request.email;
    const result = await this.client.postCollection(ONE_C_FINAL_CUSTOMER_RESOURCE, payload, ONE_C_FINAL_CUSTOMER_PROPERTIES);
    const externalId = parseGuid(record(result.payload)?.Ref_Key);
    if (!externalId) throw codeError("ONE_C_CUSTOMER_CREATE_RESPONSE_INVALID");
    return { value: { externalId }, requestCount: 2, durationMs: elapsed(startedAt) };
  }

  async readBack(externalId: string) {
    await this.requireContract();
    const guid = parseGuid(externalId);
    if (!guid) throw codeError("ONE_C_CUSTOMER_REFERENCE_INVALID");
    const startedAt = performance.now();
    const candidates = parseRows(await this.client.getFilteredCollection(
      ONE_C_FINAL_CUSTOMER_RESOURCE,
      { select: SELECT, filter: `Ref_Key eq guid'${guid}'`, top: 1 },
      { requestKind: "final_customer_authoritative_read_back" },
    ));
    return { value: candidates[0] ?? null, requestCount: 2, durationMs: elapsed(startedAt) };
  }

  private contract() {
    this.contractPromise ??= this.client.probeMetadataContract(ONE_C_FINAL_CUSTOMER_RESOURCE, ONE_C_FINAL_CUSTOMER_PROPERTIES)
      .catch((error) => { this.contractPromise = null; throw error; });
    return this.contractPromise;
  }

  private async requireContract() {
    const audit = await this.contract();
    if (audit.missingEntitySets.length > 0 || audit.missingProperties.length > 0) {
      throw codeError("ONE_C_CUSTOMER_METADATA_CONTRACT_MISMATCH");
    }
  }
}

function parseRows(value: unknown): FinalCustomerCandidate[] {
  const rows = record(value)?.value;
  if (!Array.isArray(rows)) throw codeError("ONE_C_CUSTOMER_RESPONSE_INVALID");
  return rows.map(parseCandidate).filter((candidate): candidate is FinalCustomerCandidate => candidate !== null);
}

function parseCandidate(value: unknown): FinalCustomerCandidate | null {
  const row = record(value);
  const externalId = parseGuid(row?.Ref_Key);
  const displayName = string(row?.Description) || string(row?.НаименованиеПолное);
  const kind = row?.ВидКонтрагента === "ФизическоеЛицо" ? "PERSON" : row?.ВидКонтрагента === "ЮридическоеЛицо" ? "LEGAL_ENTITY" : null;
  if (!row || !externalId || !displayName || !kind) return null;
  const comment = string(row.Комментарий);
  return {
    externalId,
    customerKind: kind,
    displayName,
    phone: normalizePhone(string(row.Телефон)),
    email: string(row.ЭлектроннаяПочта)?.toLowerCase() ?? null,
    active: row.DeletionMark !== true && row.Недействителен !== true && row.IsFolder !== true,
    operationKey: comment?.startsWith(MARKER_PREFIX) ? parseGuid(comment.slice(MARKER_PREFIX.length)) : null,
  };
}

function normalizePhone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (/^373\d{8}$/.test(digits)) return `+${digits}`;
  if (/^0\d{8}$/.test(digits)) return `+373${digits.slice(1)}`;
  return null;
}

function operationMarker(operationKey: string) { return `${MARKER_PREFIX}${operationKey}`; }
function escapeLiteral(value: string) { return value.replaceAll("'", "''"); }
function record(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null ? value as Record<string, unknown> : null; }
function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function parseGuid(value: unknown): string | null {
  const text = string(value)?.toLowerCase() ?? null;
  return text && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(text) && text !== "00000000-0000-0000-0000-000000000000" ? text : null;
}
function elapsed(startedAt: number) { return Math.max(0, Math.round(performance.now() - startedAt)); }
function codeError(code: string) { return Object.assign(new Error(code), { code }); }
