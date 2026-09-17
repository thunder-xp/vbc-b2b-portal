import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import { parseOptionalOneCGuid, parseRequiredOneCGuid } from "@/src/modules/integration/providers/one-c/one-c-guid";
import type { OneCServiceSourceRow, OneCServiceStatus, ServiceSerialResolution } from "./types";

const SOURCE = "Document_ПриемИПередачаВРемонт";
const STATUS_SOURCE = "Catalog_ЭтапыРемонта";
const SERIAL_SOURCE = "Catalog_СерииНоменклатуры";
const CURRENCY_SOURCE = "Catalog_Валюты";
const CONTRACT_SOURCE = "Catalog_ДоговорыКонтрагентов";
const SELECT = "Ref_Key,DataVersion,Number,Date,DeletionMark,Posted,Контрагент_Key,Организация_Key,Договор_Key,Номенклатура_Key,Характеристика_Key,Серия_Key,СостояниеРемонта_Key,СервисЦентр_Key,ОписаниеНеисправности,ОписаниеРемонта,ДокументПродажи,ВалютаДокумента_Key,СуммаДокумента,СуммаНДС,СуммаВключаетНДС,НДСВключатьВСтоимость,РемонтВыполнен,ВыдачаИзРемонта,РезультатРемонта,ВариантЗавершенияРемонта,ВариантРемонта,НалогообложениеНДС,ДатаРемонтВыполнен,ДатаВыдачаИзРемонта";
const MAX_COMPLETED_WORK_LENGTH = 8_000;
const envelope = z.object({ value: z.array(z.record(z.string(), z.unknown())) });

export const ONE_C_SERVICE_STATUS_REFS = {
  repairInProgress: "eae23440-315b-11e9-a7dc-94de80db60f1",
  issuedToCustomer: "eae23441-315b-11e9-a7dc-94de80db60f1",
  readyForPickup: "eae23442-315b-11e9-a7dc-94de80db60f1",
  accepted: "eae23443-315b-11e9-a7dc-94de80db60f1",
} as const;

export const ONE_C_COMPLETED_SERVICE_STATUS_REFS = new Set<string>([
  ONE_C_SERVICE_STATUS_REFS.readyForPickup,
  ONE_C_SERVICE_STATUS_REFS.issuedToCustomer,
]);

export class OneCServiceHistoryProvider {
  private statuses: Promise<Map<string, string>> | null = null;
  private currencies: Promise<Map<string, string>> | null = null;
  private readonly contracts = new Map<string, string | null>();

  constructor(private readonly client: OneCODataClient) {}

  async fetchPage(input: { skip: number; top: number; rangeStart: string; rangeEnd: string }) {
    validatePage(input.skip, input.top);
    const [payload, statuses, currencies] = await Promise.all([
      this.client.getLiteralDateRange(SOURCE, {
        startDate: input.rangeStart,
        endDate: input.rangeEnd,
        select: SELECT,
        top: input.top,
        skip: input.skip,
      }, { requestKind: "service_history_headers" }),
      this.getStatuses(),
      this.getCurrencies(),
    ]);
    const sourceRows = envelope.parse(payload).value;
    const contracts = await this.getContracts(sourceRows.flatMap((row) => {
      const ref = parseOptionalOneCGuid(row.Договор_Key);
      return ref ? [ref] : [];
    }));
    const rows = sourceRows.map((row) => mapRow(row, statuses, currencies, contracts));
    return { rows, pageComplete: rows.length < input.top };
  }

  private getStatuses() {
    if (!this.statuses) {
      this.statuses = this.client.get(STATUS_SOURCE, {
        "$select": "Ref_Key,Description,DeletionMark",
        "$top": "100",
      }, { requestKind: "service_history_status_catalog" }).then((payload) => {
        const result = new Map<string, string>();
        for (const row of envelope.parse(payload).value) {
          const ref = parseOptionalOneCGuid(row.Ref_Key);
          const description = text(row.Description);
          if (ref && description && row.DeletionMark !== true) result.set(ref, description);
        }
        return result;
      });
    }
    return this.statuses;
  }

  private getCurrencies() {
    if (!this.currencies) {
      this.currencies = this.client.get(CURRENCY_SOURCE, {
        "$select": "Ref_Key,Code,Description,DeletionMark",
        "$top": "100",
      }, { requestKind: "service_history_currency_catalog" }).then((payload) => {
        const result = new Map<string, string>();
        for (const row of envelope.parse(payload).value) {
          const ref = parseOptionalOneCGuid(row.Ref_Key);
          const code = currencyCode(row.Description) ?? currencyCode(row.Code);
          if (ref && code && row.DeletionMark !== true) result.set(ref, code);
        }
        return result;
      });
    }
    return this.currencies;
  }

  private async getContracts(refs: string[]) {
    const normalizedRefs = [...new Set(refs.map((ref) => ref.toLowerCase()))];
    const missing = normalizedRefs.filter((ref) => !this.contracts.has(ref));
    await mapBounded(chunk(missing, 20), 3, async (batch) => {
      const payload = await this.client.getLiteralGuidBatch(CONTRACT_SOURCE, {
        refs: batch,
        select: "Ref_Key,Description,DeletionMark",
      }, { requestKind: "service_history_contract_catalog_batch" });
      const rows = envelope.parse(payload).value;
      for (const ref of batch) {
        const row = rows.find((candidate) => parseOptionalOneCGuid(candidate.Ref_Key)?.toLowerCase() === ref);
        this.contracts.set(ref, row && row.DeletionMark !== true ? nullableText(row.Description) : null);
      }
    });
    return this.contracts;
  }
}

export class OneCServiceSerialProvider {
  private readonly cache = new Map<string, ServiceSerialResolution>();

  constructor(private readonly client: OneCODataClient, private readonly concurrency = 3) {}

  async resolve(refs: string[]): Promise<Map<string, ServiceSerialResolution>> {
    const uniqueRefs = [...new Set(refs.map((ref) => ref.toLowerCase()))];
    const missing = uniqueRefs.filter((ref) => !this.cache.has(ref));
    const batches = chunk(missing, 20);
    await mapBounded(batches, this.concurrency, async (batch) => {
      const payload = await this.client.getLiteralGuidBatch(SERIAL_SOURCE, {
        refs: batch,
        select: "Ref_Key,Description,DeletionMark,DataVersion",
      }, { requestKind: "service_history_serial_catalog_batch" });
      const grouped = new Map<string, Array<Record<string, unknown>>>();
      for (const row of envelope.parse(payload).value) {
        const ref = parseOptionalOneCGuid(row.Ref_Key)?.toLowerCase();
        if (ref && batch.includes(ref)) grouped.set(ref, [...(grouped.get(ref) ?? []), row]);
      }
      for (const ref of batch) {
        const rows = grouped.get(ref) ?? [];
        const row = rows[0];
        const value = row && row.DeletionMark !== true ? nullableText(row.Description) : null;
        const state = rows.length > 1 ? "conflict" : value ? "resolved" : "unmapped";
        this.cache.set(ref, {
          state,
          value: state === "resolved" ? value : null,
          sourceFingerprint: createHash("sha256").update([
            ref,
            state,
            value ?? "",
            row ? nullableText(row.DataVersion) ?? "" : "",
          ].join("|"), "utf8").digest("hex"),
        });
      }
    });
    return new Map(uniqueRefs.map((ref) => [ref, this.cache.get(ref)!]));
  }
}

function mapRow(
  row: Record<string, unknown>,
  statuses: ReadonlyMap<string, string>,
  currencies: ReadonlyMap<string, string>,
  contracts: ReadonlyMap<string, string | null>,
): OneCServiceSourceRow {
  const sourceDocumentRef = requiredGuid(row.Ref_Key, "document");
  const counterpartyRef = requiredGuid(row.Контрагент_Key, "counterparty");
  const sourceStatusRef = parseOptionalOneCGuid(row.СостояниеРемонта_Key);
  const sourceStatus = sourceStatusRef ? statuses.get(sourceStatusRef) ?? null : null;
  const sourcePosted = row.Posted === true;
  const sourceDeletionMark = row.DeletionMark === true;
  const sourceDataVersion = nullableText(row.DataVersion);
  const sourceRepairDescription = nullableText(row.ОписаниеРемонта);
  const completedWorkSummary = normalizeCompletedWork(row.ОписаниеРемонта);
  const contractRef = parseOptionalOneCGuid(row.Договор_Key);
  const currencyRef = parseOptionalOneCGuid(row.ВалютаДокумента_Key);
  const serviceAmount = decimalString(row.СуммаДокумента);
  const vatAmount = decimalString(row.СуммаНДС);
  const repairCompleted = row.РемонтВыполнен === true;
  const issuedToCustomer = row.ВыдачаИзРемонта === true;
  const repairCompletedAt = optionalDate(row.ДатаРемонтВыполнен);
  const issuedAt = optionalDate(row.ДатаВыдачаИзРемонта);
  return {
    sourceDocumentRef,
    sourceDocumentNumber: text(row.Number),
    sourceDocumentDate: requiredDate(row.Date),
    sourcePosted,
    sourceDeletionMark,
    sourceDataVersion,
    sourceStatusRef,
    sourceStatus,
    normalizedStatus: normalizeStatusRef(sourceStatusRef),
    counterpartyRef,
    productRef: parseOptionalOneCGuid(row.Номенклатура_Key),
    characteristicRef: parseOptionalOneCGuid(row.Характеристика_Key),
    serialRef: parseOptionalOneCGuid(row.Серия_Key),
    organizationRef: parseOptionalOneCGuid(row.Организация_Key),
    contractRef,
    contractSnapshot: contractRef ? contracts.get(contractRef.toLowerCase()) ?? null : null,
    serviceCenterRef: parseOptionalOneCGuid(row.СервисЦентр_Key),
    reportedFault: nullableText(row.ОписаниеНеисправности),
    sourceRepairDescription,
    completedWorkSummary,
    serviceAmount,
    vatAmount,
    currencyRef,
    currencyCode: currencyRef ? currencies.get(currencyRef) ?? null : null,
    sumIncludesVat: optionalBoolean(row.СуммаВключаетНДС),
    vatIncludedInCost: optionalBoolean(row.НДСВключатьВСтоимость),
    repairCompleted,
    issuedToCustomer,
    repairResult: optionalBoolean(row.РезультатРемонта),
    repairCompletionVariant: nullableText(row.ВариантЗавершенияРемонта),
    repairVariant: nullableText(row.ВариантРемонта),
    taxationMode: nullableText(row.НалогообложениеНДС),
    repairCompletedAt,
    issuedAt,
    sourceSaleReference: parseOptionalOneCGuid(row.ДокументПродажи),
    sourceFingerprint: createHash("sha256").update([
      sourceDocumentRef,
      sourceDataVersion ?? "",
      sourceStatusRef ?? "",
      String(sourcePosted),
      String(sourceDeletionMark),
      sourceRepairDescription ?? "",
      serviceAmount ?? "",
      vatAmount ?? "",
      currencyRef ?? "",
      currencyRef ? currencies.get(currencyRef) ?? "" : "",
      String(optionalBoolean(row.СуммаВключаетНДС)),
      String(optionalBoolean(row.НДСВключатьВСтоимость)),
      String(repairCompleted),
      String(issuedToCustomer),
      String(optionalBoolean(row.РезультатРемонта)),
      nullableText(row.ВариантЗавершенияРемонта) ?? "",
      nullableText(row.ВариантРемонта) ?? "",
      nullableText(row.НалогообложениеНДС) ?? "",
      repairCompletedAt ?? "",
      issuedAt ?? "",
      parseOptionalOneCGuid(row.Организация_Key) ?? "",
      contractRef ? contracts.get(contractRef.toLowerCase()) ?? "" : "",
    ].join("|"), "utf8").digest("hex"),
  };
}

export function normalizeOneCServiceStatus(value: string | null): OneCServiceStatus {
  return normalizeStatus(value);
}

function normalizeStatus(value: string | null): OneCServiceStatus {
  switch (value?.trim().toLocaleLowerCase("ru")) {
    case "принят в ремонт": return "accepted";
    case "в работе": return "repair_in_progress";
    case "к выдаче": return "ready_for_pickup";
    case "выдан покупателю": return "issued_to_customer";
    default: return "unknown";
  }
}

function normalizeStatusRef(value: string | null): OneCServiceStatus {
  switch (value?.toLowerCase()) {
    case ONE_C_SERVICE_STATUS_REFS.accepted: return "accepted";
    case ONE_C_SERVICE_STATUS_REFS.repairInProgress: return "repair_in_progress";
    case ONE_C_SERVICE_STATUS_REFS.readyForPickup: return "ready_for_pickup";
    case ONE_C_SERVICE_STATUS_REFS.issuedToCustomer: return "issued_to_customer";
    default: return "unknown";
  }
}

function requiredGuid(value: unknown, field: string) {
  const parsed = parseRequiredOneCGuid(value);
  if (!parsed) throw new Error(`Invalid 1C service ${field} reference.`);
  return parsed;
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown) { return text(value) || null; }
function optionalBoolean(value: unknown): boolean | null { return typeof value === "boolean" ? value : null; }
function decimalString(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value.toFixed(2) : null;
}
function currencyCode(value: unknown): string | null {
  const normalized = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}
function optionalDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw || raw.startsWith("0001-01-01")) return null;
  const date = parseOneCDate(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export function normalizeCompletedWork(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  return normalized ? normalized.slice(0, MAX_COMPLETED_WORK_LENGTH) : null;
}
function requiredDate(value: unknown) { const date = parseOneCDate(text(value)); if (Number.isNaN(date.getTime())) throw new Error("Invalid 1C service date."); return date.toISOString(); }
function parseOneCDate(value: string) {
  return new Date(/(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
}
function validatePage(skip: number, top: number) { if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(top) || top < 1 || top > 100) throw new Error("Invalid service-history page."); }

export const oneCServiceHistoryEntities = {
  source: SOURCE,
  status: STATUS_SOURCE,
  serial: SERIAL_SOURCE,
  currency: CURRENCY_SOURCE,
  contract: CONTRACT_SOURCE,
} as const;

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function mapBounded<T>(items: T[], concurrency: number, mapper: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) await mapper(items[cursor++]!);
  }));
}
