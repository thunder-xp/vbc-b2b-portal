import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import { parseOptionalOneCGuid, parseRequiredOneCGuid } from "@/src/modules/integration/providers/one-c/one-c-guid";
import type { OneCServiceSourceRow, OneCServiceStatus, ServiceSerialResolution } from "./types";

const SOURCE = "Document_ПриемИПередачаВРемонт";
const STATUS_SOURCE = "Catalog_ЭтапыРемонта";
const SERIAL_SOURCE = "Catalog_СерииНоменклатуры";
const SELECT = "Ref_Key,DataVersion,Number,Date,DeletionMark,Posted,Контрагент_Key,Договор_Key,Номенклатура_Key,Характеристика_Key,Серия_Key,СостояниеРемонта_Key,СервисЦентр_Key,ОписаниеНеисправности,ОписаниеРемонта,ДокументПродажи";
const MAX_COMPLETED_WORK_LENGTH = 8_000;
const envelope = z.object({ value: z.array(z.record(z.string(), z.unknown())) });

export class OneCServiceHistoryProvider {
  private statuses: Promise<Map<string, string>> | null = null;

  constructor(private readonly client: OneCODataClient) {}

  async fetchPage(input: { skip: number; top: number; rangeStart: string; rangeEnd: string }) {
    validatePage(input.skip, input.top);
    const [payload, statuses] = await Promise.all([
      this.client.getLiteralDateRange(SOURCE, {
        startDate: input.rangeStart,
        endDate: input.rangeEnd,
        select: SELECT,
        top: input.top,
        skip: input.skip,
      }, { requestKind: "service_history_headers" }),
      this.getStatuses(),
    ]);
    const rows = envelope.parse(payload).value.map((row) => mapRow(row, statuses));
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

function mapRow(row: Record<string, unknown>, statuses: ReadonlyMap<string, string>): OneCServiceSourceRow {
  const sourceDocumentRef = requiredGuid(row.Ref_Key, "document");
  const counterpartyRef = requiredGuid(row.Контрагент_Key, "counterparty");
  const sourceStatusRef = parseOptionalOneCGuid(row.СостояниеРемонта_Key);
  const sourceStatus = sourceStatusRef ? statuses.get(sourceStatusRef) ?? null : null;
  const sourcePosted = row.Posted === true;
  const sourceDeletionMark = row.DeletionMark === true;
  const sourceDataVersion = nullableText(row.DataVersion);
  const sourceRepairDescription = nullableText(row.ОписаниеРемонта);
  const completedWorkSummary = normalizeCompletedWork(row.ОписаниеРемонта);
  return {
    sourceDocumentRef,
    sourceDocumentNumber: text(row.Number),
    sourceDocumentDate: requiredDate(row.Date),
    sourcePosted,
    sourceDeletionMark,
    sourceDataVersion,
    sourceStatusRef,
    sourceStatus,
    normalizedStatus: normalizeStatus(sourceStatus),
    counterpartyRef,
    productRef: parseOptionalOneCGuid(row.Номенклатура_Key),
    characteristicRef: parseOptionalOneCGuid(row.Характеристика_Key),
    serialRef: parseOptionalOneCGuid(row.Серия_Key),
    contractRef: parseOptionalOneCGuid(row.Договор_Key),
    serviceCenterRef: parseOptionalOneCGuid(row.СервисЦентр_Key),
    reportedFault: nullableText(row.ОписаниеНеисправности),
    sourceRepairDescription,
    completedWorkSummary,
    sourceSaleReference: parseOptionalOneCGuid(row.ДокументПродажи),
    sourceFingerprint: createHash("sha256").update([
      sourceDocumentRef,
      sourceDataVersion ?? "",
      sourceStatusRef ?? "",
      String(sourcePosted),
      String(sourceDeletionMark),
      sourceRepairDescription ?? "",
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

function requiredGuid(value: unknown, field: string) {
  const parsed = parseRequiredOneCGuid(value);
  if (!parsed) throw new Error(`Invalid 1C service ${field} reference.`);
  return parsed;
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown) { return text(value) || null; }
export function normalizeCompletedWork(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  return normalized ? normalized.slice(0, MAX_COMPLETED_WORK_LENGTH) : null;
}
function requiredDate(value: unknown) { const date = new Date(text(value)); if (Number.isNaN(date.getTime())) throw new Error("Invalid 1C service date."); return date.toISOString(); }
function validatePage(skip: number, top: number) { if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(top) || top < 1 || top > 100) throw new Error("Invalid service-history page."); }

export const oneCServiceHistoryEntities = { source: SOURCE, status: STATUS_SOURCE, serial: SERIAL_SOURCE } as const;

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function mapBounded<T>(items: T[], concurrency: number, mapper: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) await mapper(items[cursor++]!);
  }));
}
