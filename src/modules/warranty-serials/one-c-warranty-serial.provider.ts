import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import { parseOptionalOneCGuid, parseRequiredOneCGuid } from "@/src/modules/integration/providers/one-c/one-c-guid";
import type { WarrantySourceDocument, WarrantySourceEvent, WarrantySourcePage } from "./types";

const SALES = "Document_РасходнаяНакладная";
const RETURNS = "Document_ПриходнаяНакладная";
const ZERO_GUID = "00000000-0000-0000-0000-000000000000";
const headerEnvelope = z.object({ value: z.array(z.record(z.string(), z.unknown())) });

type Stage = "sale_scan" | "return_scan";
type Row = Record<string, unknown>;

export class OneCWarrantySerialProvider {
  private readonly serialCache = new Map<string, Promise<string | null>>();
  private readonly productCache = new Map<string, Promise<ProductSnapshot | null>>();

  constructor(private readonly client: OneCODataClient, private readonly concurrency = 5) {}

  async fetchPage(input: { stage: Stage; skip: number; top: number; rangeStart: string; rangeEnd: string }): Promise<WarrantySourcePage> {
    validatePage(input.skip, input.top);
    const entity = input.stage === "sale_scan" ? SALES : RETURNS;
    const select = input.stage === "sale_scan"
      ? "Ref_Key,DataVersion,Number,Date,Posted,DeletionMark,Контрагент_Key,Договор_Key,Заказ,Заказ_Type,СтруктурнаяЕдиница_Key,Организация_Key"
      : "Ref_Key,DataVersion,Number,Date,Posted,DeletionMark,ВидОперации,Контрагент_Key,ДокументОснование,ДокументОснование_Type,Организация_Key,СтруктурнаяЕдиница_Key";
    const payload = await this.client.get(entity, {
      "$filter": `Date ge datetime'${input.rangeStart}T00:00:00' and Date le datetime'${input.rangeEnd}T23:59:59'`,
      "$select": select,
      "$top": String(input.top),
      "$skip": String(input.skip),
    }, { requestKind: `warranty_${input.stage}_headers` });
    const parsed = headerEnvelope.parse(payload);
    const results = await mapBounded(parsed.value, this.concurrency, (header) =>
      input.stage === "return_scan" && header["ВидОперации"] !== "ВозвратОтПокупателя"
        ? Promise.resolve({ document: sourceDocument(input.stage, header), events: [] })
        : this.readDocument(input.stage, header));
    return {
      headersReceived: parsed.value.length,
      pageComplete: parsed.value.length < input.top,
      documents: results.map((item) => item.document),
      events: results.flatMap((item) => item.events),
    };
  }

  private async readDocument(stage: Stage, header: Row): Promise<{ document: WarrantySourceDocument; events: WarrantySourceEvent[] }> {
    const document = sourceDocument(stage, header);
    const detail = asRow(await this.client.get(`${document.sourceEntity}(guid'${document.sourceDocumentRef}')`, {
      "$select": "Ref_Key,DataVersion,Number,Date,Posted,DeletionMark,ВидОперации,Контрагент_Key,ДокументОснование,ДокументОснование_Type,Организация_Key,СтруктурнаяЕдиница_Key,Запасы,СерииНоменклатуры",
    }, { requestKind: `warranty_${stage}_detail` }));
    return { document, events: await this.mapEvents(stage, detail, document) };
  }

  private async mapEvents(stage: Stage, detail: Row, document: WarrantySourceDocument): Promise<WarrantySourceEvent[]> {
    const stockRows = arrayRows(detail["Запасы"]);
    const serialRows = arrayRows(detail["СерииНоменклатуры"]);
    const stockByLink = new Map(stockRows.map((row) => [string(row["КлючСвязи"]), row]));
    const sourceSaleRef = stage === "return_scan" ? parseOptionalOneCGuid(detail["ДокументОснование"]) : null;
    const sourceType = nullableString(detail["ДокументОснование_Type"]);
    return (await mapBounded(serialRows, this.concurrency, async (serialRow, serialIndex) => {
      const linkKey = string(serialRow["КлючСвязи"]);
      const stock = stockByLink.get(linkKey);
      const serialRef = parseRequiredOneCGuid(serialRow["Серия_Key"]);
      if (!stock || !serialRef) return [];
      const productRef = parseRequiredOneCGuid(stock["Номенклатура_Key"]);
      const serial = await this.resolveSerial(serialRef);
      const product = productRef ? await this.resolveProduct(productRef) : null;
      if (!serial) return [];
      const quantity = positiveNumber(serialRow["Количество"]) ?? positiveNumber(stock["Количество"]) ?? 1;
      const sourceLineNumber = nonNegativeInteger(stock.LineNumber);
      const sourceSerialLineNumber = nonNegativeInteger(serialRow.LineNumber ?? serialIndex);
      const returnLinkValid = stage === "sale_scan" || (sourceSaleRef && sourceType === "StandardODATA.Document_РасходнаяНакладная");
      const exactProduct = productRef !== null;
      const eventType: WarrantySourceEvent["eventType"] = stage === "sale_scan"
        ? document.sourceDeletionMark ? "sale_deleted" : document.sourcePosted ? "sale_observed" : "sale_unposted"
        : returnLinkValid && exactProduct && document.sourcePosted && !document.sourceDeletionMark && quantity > 0
          ? "customer_return" : "conflict_observed";
      const reasons = eventType === "conflict_observed" ? [
        !sourceSaleRef ? "return_source_sale_missing" : "return_source_type_mismatch",
      ] : [];
      const base: WarrantySourceEvent = {
        serial,
        eventType,
        sourceEntity: document.sourceEntity,
        sourceDocumentRef: document.sourceDocumentRef,
        relatedSourceDocumentRef: stage === "sale_scan" ? document.sourceDocumentRef : sourceSaleRef,
        sourceDocumentNumber: document.sourceDocumentNumber,
        sourceDocumentDate: document.sourceDocumentDate,
        sourcePosted: document.sourcePosted,
        sourceDeletionMark: document.sourceDeletionMark,
        sourceDataVersion: document.sourceDataVersion,
        sourceLineNumber,
        sourceSerialLineNumber,
        sourceLinkKey: linkKey,
        counterpartyRef: parseOptionalOneCGuid(detail["Контрагент_Key"]),
        productRef,
        characteristicRef: parseOptionalOneCGuid(stock["Характеристика_Key"]),
        organizationRef: parseOptionalOneCGuid(detail["Организация_Key"]),
        warehouseRef: parseOptionalOneCGuid(detail["СтруктурнаяЕдиница_Key"]),
        quantity,
        productSkuSnapshot: product?.sku ?? null,
        productNameSnapshot: product?.name ?? null,
        warrantyMonthsSnapshot: product?.warrantyMonths ?? null,
        mappingState: eventType === "conflict_observed" ? "conflict" : "mapped",
        reviewReasonCodes: reasons,
      };
      return stage === "return_scan" && eventType === "customer_return"
        ? [base, { ...base, eventType: "stock_reentry" as const, reviewReasonCodes: ["returned_to_stock"] }]
        : [base];
    })).flat();
  }

  private resolveSerial(ref: string) {
    return cached(this.serialCache, ref, async () => {
      const row = asRow(await this.client.get(`Catalog_СерииНоменклатуры(guid'${ref}')`, { "$select": "Ref_Key,Description,DeletionMark" }, { requestKind: "warranty_serial_catalog" }));
      return row.DeletionMark === true ? null : nullableString(row.Description);
    });
  }

  private resolveProduct(ref: string) {
    return cached(this.productCache, ref, async () => {
      const row = asRow(await this.client.get(`Catalog_Номенклатура(guid'${ref}')`, {
        "$select": "Ref_Key,Артикул,Description,ГарантийныйСрок,ИспользоватьСерииНоменклатуры,DeletionMark,Недействителен",
      }, { requestKind: "warranty_product_catalog" }));
      if (row.DeletionMark === true || row["Недействителен"] === true) return null;
      return { sku: nullableString(row["Артикул"]), name: nullableString(row.Description), warrantyMonths: warrantyMonths(row["ГарантийныйСрок"]) };
    });
  }
}

type ProductSnapshot = { sku: string | null; name: string | null; warrantyMonths: number | null };
function sourceDocument(stage: Stage, header: Row): WarrantySourceDocument {
  const sourceEntity = stage === "sale_scan" ? SALES : RETURNS;
  const sourceDocumentRef = requiredGuid(header.Ref_Key, "document Ref_Key");
  const sourcePosted = header.Posted === true;
  const sourceDeletionMark = header.DeletionMark === true;
  const sourceDataVersion = nullableString(header.DataVersion);
  return {
    sourceEntity,
    sourceDocumentRef,
    sourceDocumentNumber: string(header.Number),
    sourceDocumentDate: requiredDate(header.Date),
    sourcePosted,
    sourceDeletionMark,
    sourceDataVersion,
    sourceFingerprint: fingerprint(sourceEntity, sourceDocumentRef, sourceDataVersion ?? "", String(sourcePosted), String(sourceDeletionMark)),
  };
}
function requiredGuid(value: unknown, field: string) { const parsed = parseRequiredOneCGuid(value); if (!parsed) throw new Error(`Invalid ${field}.`); return parsed; }
function asRow(value: unknown): Row { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid 1C document response."); return value as Row; }
function arrayRows(value: unknown): Row[] { return Array.isArray(value) ? value.filter((item): item is Row => !!item && typeof item === "object" && !Array.isArray(item)) : []; }
function string(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nullableString(value: unknown) { const result = string(value); return result || null; }
function requiredDate(value: unknown) { const text = string(value); const date = new Date(text); if (!text || Number.isNaN(date.getTime())) throw new Error("Invalid 1C document date."); return date.toISOString(); }
function nonNegativeInteger(value: unknown) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : 0; }
function positiveNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function warrantyMonths(value: unknown) { const number = Number(value); return Number.isInteger(number) && number > 0 && number <= 240 ? number : null; }
function fingerprint(...parts: string[]) { return createHash("sha256").update(parts.join("|"), "utf8").digest("hex"); }
function validatePage(skip: number, top: number) { if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(top) || top < 1 || top > 100) throw new Error("Invalid warranty sync page."); }
function cached<T>(cache: Map<string, Promise<T>>, key: string, factory: () => Promise<T>) { const current = cache.get(key); if (current) return current; const created = factory(); cache.set(key, created); return created; }
async function mapBounded<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await mapper(items[index]!, index); }
  }));
  return result;
}

export const warrantySerialSourceEntities = { sales: SALES, returns: RETURNS } as const;
export const zeroOneCGuid = ZERO_GUID;
