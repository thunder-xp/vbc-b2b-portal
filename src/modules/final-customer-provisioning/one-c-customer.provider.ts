import "server-only";

import type { OneCEnv } from "@/src/lib/env";
import {
  OneCODataClient,
  type OneCODataMetadataContractResult,
} from "@/src/modules/integration/providers/one-c/one-c-odata-client";

import type {
  FinalCustomerCandidate,
  FinalCustomerMasterProvider,
  FinalCustomerProviderResult,
  FinalCustomerProvisioningRequest,
} from "./external-types";

export const ONE_C_FINAL_CUSTOMER_RESOURCE = "Catalog_Контрагенты";
export const ONE_C_FINAL_CUSTOMER_PROPERTIES = [
  "Ref_Key", "Description", "НаименованиеПолное", "ВидКонтрагента", "Покупатель",
  "Поставщик", "Недействителен", "DeletionMark", "IsFolder", "НомерТелефонаДляПоиска",
  "АдресЭПДляПоиска", "КонтактнаяИнформация", "Комментарий",
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
  phoneLookupProperty: "НомерТелефонаДляПоиска";
  emailLookupProperty: "АдресЭПДляПоиска";
  contactCollectionProperty: "КонтактнаяИнформация";
  createContractProven: false;
  createBlocker: "ONE_C_CONTACT_KIND_AND_CREATE_CONTRACT_NOT_PROVEN";
  lookupProjectionProbe: "PASS" | "NO_SAMPLE" | "FAIL";
}>;

export class OneCFinalCustomerProvider implements FinalCustomerMasterProvider {
  private readonly client: OneCODataClient;
  private contractPromise: Promise<OneCODataMetadataContractResult> | null = null;

  constructor(config: OneCEnv) {
    this.client = new OneCODataClient(config);
  }

  async auditContract(): Promise<OneCFinalCustomerContractAudit> {
    const result = await this.contract();
    const metadataPassed = result.missingEntitySets.length === 0 && result.missingProperties.length === 0;
    const lookupProjectionProbe = metadataPassed ? await this.probeLookupProjection() : "FAIL";
    return {
      passed: metadataPassed && lookupProjectionProbe !== "FAIL",
      entitySet: result.entitySet,
      entityType: result.entityType,
      presentProperties: result.presentProperties,
      missingProperties: result.missingProperties,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      phoneLookupProperty: "НомерТелефонаДляПоиска",
      emailLookupProperty: "АдресЭПДляПоиска",
      contactCollectionProperty: "КонтактнаяИнформация",
      createContractProven: false,
      createBlocker: "ONE_C_CONTACT_KIND_AND_CREATE_CONTRACT_NOT_PROVEN",
      lookupProjectionProbe,
    };
  }

  async findCandidates(request: FinalCustomerProvisioningRequest) {
    await this.requireContract();
    const startedAt = performance.now();
    const localPhone = request.verifiedPhone.replace(/^\+373/, "");
    const filters = [`substringof('${escapeLiteral(localPhone)}',НомерТелефонаДляПоиска) eq true`];
    if (request.email) filters.push(`substringof('${escapeLiteral(request.email.toLowerCase())}',АдресЭПДляПоиска) eq true`);
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

  async create(request: FinalCustomerProvisioningRequest): Promise<FinalCustomerProviderResult<{ externalId: string }>> {
    void request;
    throw codeError("ONE_C_CUSTOMER_CREATE_CONTRACT_NOT_PROVEN");
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

  private async probeLookupProjection(): Promise<"PASS" | "NO_SAMPLE" | "FAIL"> {
    try {
      for (const filter of ["НомерТелефонаДляПоиска ne ''", "АдресЭПДляПоиска ne ''"]) {
        const payload = record(await this.client.getFilteredCollection(
          ONE_C_FINAL_CUSTOMER_RESOURCE,
          { select: SELECT, filter, top: 1 },
          { requestKind: "final_customer_lookup_projection_probe" },
        ));
        if (!payload || !Array.isArray(payload.value)) return "FAIL";
        if (payload.value.length === 0) continue;
        const row = record(payload.value[0]);
        return row && Array.isArray(row.КонтактнаяИнформация) ? "PASS" : "FAIL";
      }
      return "NO_SAMPLE";
    } catch {
      return "FAIL";
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
  const contacts = Array.isArray(row.КонтактнаяИнформация)
    ? row.КонтактнаяИнформация.map(record).filter((contact): contact is Record<string, unknown> => contact !== null)
    : [];
  return {
    externalId,
    customerKind: kind,
    displayName,
    phones: unique(contacts.flatMap((contact) => {
      const phone = normalizePhone(string(contact.НомерТелефонаБезКодов) ?? string(contact.НомерТелефона));
      return phone ? [phone] : [];
    })),
    emails: unique(contacts.flatMap((contact) => {
      const email = normalizeEmail(string(contact.АдресЭП) ?? string(contact.Значение) ?? string(contact.Представление));
      return email ? [email] : [];
    })),
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

function normalizeEmail(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function unique(values: string[]) { return [...new Set(values)]; }

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
