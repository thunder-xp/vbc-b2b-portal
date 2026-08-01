import type { DocumentFetchRequestDTO, DocumentProvider } from "../../contracts";
import type { DocumentDTO, ExternalReferenceDTO, IntegrationPageResultDTO } from "../../dto";
import { IntegrationUnsupportedOperationError, IntegrationValidationError } from "../../errors";
import { OneCODataClient } from "./one-c-odata-client";
import { parseOptionalOneCGuid, parseRequiredOneCGuid } from "./one-c-guid";
import type { OneCProviderConfig } from "./one-c-provider.config";

export const ONE_C_DOCUMENT_SOURCES = [
  { entity: "Document_СчетФактура", type: "fiscal_invoice", title: "Счёт-фактура", fields: ["Исправление", "ИсправляемыйСчетФактура_Key", "ДокументыОснования"] },
  { entity: "Document_РасходнаяНакладная", type: "delivery_note", title: "Расходная накладная", fields: ["Заказ", "Заказ_Type", "ДокументОснование", "ДокументОснование_Type"] },
  { entity: "Document_СчетНаОплату", type: "invoice", title: "Счёт на оплату", fields: ["ДокументОснование", "ДокументОснование_Type"] },
  { entity: "Document_СверкаВзаиморасчетов", type: "reconciliation_statement", title: "Акт сверки", fields: ["НачалоПериода", "КонецПериода", "Статус"] },
  { entity: "Document_ЗаказПокупателя", type: "order_confirmation", title: "Подтверждение заказа", fields: [] },
] as const;

export type OneCDocumentSource = (typeof ONE_C_DOCUMENT_SOURCES)[number];
export type OneCDocumentPage = { items: DocumentDTO[]; received: number; rejected: number; nextSkip: number | null };

const COMMON_FIELDS = [
  "Ref_Key", "Number", "Date", "Posted", "DeletionMark", "Контрагент_Key", "Договор_Key", "ВалютаДокумента_Key", "DataVersion",
] as const;
const ORDER_TYPE = "StandardODATA.Document_ЗаказПокупателя";

export class OneCDocumentODataProvider implements DocumentProvider {
  private readonly client: OneCODataClient;

  constructor(config: Pick<OneCProviderConfig, "baseUrl" | "username" | "password" | "requestTimeoutMs">) {
    this.client = new OneCODataClient(config);
  }

  async fetchDocuments(input: DocumentFetchRequestDTO): Promise<IntegrationPageResultDTO<DocumentDTO>> {
    const cursor = parseCursor(input.page?.cursor);
    const sources = requestedSources(input.documentTypes);
    const source = sources[cursor.sourceIndex];
    if (!source) return { items: [], nextCursor: null };
    const page = await this.fetchSourcePage(source, cursor.skip, boundedLimit(input.page?.limit));
    const nextCursor = page.nextSkip === null
      ? cursor.sourceIndex + 1 < sources.length ? `${cursor.sourceIndex + 1}:0` : null
      : `${cursor.sourceIndex}:${page.nextSkip}`;
    return { items: page.items, nextCursor };
  }

  async fetchSourcePage(source: OneCDocumentSource, skip: number, limit = 100): Promise<OneCDocumentPage> {
    const payload = await this.client.getLiteral(
      source.entity,
      buildDocumentMetadataPageQuery(source, skip, limit),
      { requestKind: "document_metadata_page" },
    );
    if (!isRecord(payload) || !Array.isArray(payload.value)) {
      throw new IntegrationValidationError("1C document metadata envelope is invalid.");
    }
    const rows = payload.value;
    const items = rows.flatMap((row) => mapRow(source, row));
    return {
      items,
      received: rows.length,
      rejected: rows.length - items.length,
      nextSkip: rows.length < limit ? null : skip + rows.length,
    };
  }

  async fetchDocumentFile(): Promise<never> {
    throw new IntegrationUnsupportedOperationError("1C document binary and print-form retrieval is not verified.");
  }
}

export function buildDocumentMetadataPageQuery(
  source: OneCDocumentSource,
  skip: number,
  limit = 100,
): string {
  const commonFields = source.type === "reconciliation_statement"
    ? COMMON_FIELDS.filter((field) => field !== "Договор_Key")
    : [...COMMON_FIELDS];
  return `$select=${[...commonFields, ...source.fields].join(",")}` +
    `&$top=${boundedLimit(limit)}` +
    `&$skip=${nonNegativeInteger(skip)}` +
    "&$format=json";
}

function mapRow(source: OneCDocumentSource, value: unknown): DocumentDTO[] {
  if (!isRecord(value)) return [];
  const sourceRef = parseRequiredOneCGuid(value.Ref_Key);
  const counterpartyRef = parseRequiredOneCGuid(value["Контрагент_Key"]);
  const documentNumber = text(value.Number);
  const documentDate = isoDate(value.Date);
  if (!sourceRef || !counterpartyRef || !documentNumber || !documentDate || typeof value.Posted !== "boolean" || typeof value.DeletionMark !== "boolean") return [];

  const correctionReference = source.type === "fiscal_invoice" && value["Исправление"] === true
    ? reference(parseOptionalOneCGuid(value["ИсправляемыйСчетФактура_Key"]), "fiscal-invoice")
    : null;
  const orderReference = source.type === "order_confirmation"
    ? reference(sourceRef, "customer-order")
    : source.type === "delivery_note"
      ? typedReference(value["Заказ"], value["Заказ_Type"], "customer-order") ?? typedReference(value["ДокументОснование"], value["ДокументОснование_Type"], "customer-order")
      : typedReference(value["ДокументОснование"], value["ДокументОснование_Type"], "customer-order");

  return [{
    reference: external(sourceRef, source.entity),
    ownerReference: external(counterpartyRef, "counterparty"),
    sourceEntity: source.entity,
    title: `${source.title} № ${documentNumber}`,
    documentType: source.type,
    documentNumber,
    documentDate,
    posted: value.Posted,
    deletionMarked: value.DeletionMark,
    contractReference: reference(parseOptionalOneCGuid(value["Договор_Key"]), "partner-contract"),
    orderReference,
    baseDocumentReference: typedReference(value["ДокументОснование"], value["ДокументОснование_Type"], "base-document"),
    correctionReference,
    currencyReference: reference(parseOptionalOneCGuid(value["ВалютаДокумента_Key"]), "currency"),
    retrievalCapability: "metadata_only",
    fileName: null,
    url: null,
    version: text(value.DataVersion) || null,
    isActive: !value.DeletionMark,
    metadata: { sourceReference: external(sourceRef, source.entity), sourceUpdatedAt: documentDate, importedAt: new Date().toISOString(), sourceVersion: text(value.DataVersion) || null },
  }];
}

function requestedSources(types: string[] | undefined): OneCDocumentSource[] {
  return types?.length ? ONE_C_DOCUMENT_SOURCES.filter((source) => types.includes(source.type)) : [...ONE_C_DOCUMENT_SOURCES];
}
function typedReference(value: unknown, type: unknown, externalType: string): ExternalReferenceDTO | null {
  return type === ORDER_TYPE ? reference(parseOptionalOneCGuid(value), externalType) : null;
}
function reference(value: string | null, externalType: string) { return value ? external(value, externalType) : null; }
function external(externalId: string, externalType: string): ExternalReferenceDTO { return { providerCode: "one-c", externalId, externalType }; }
function isoDate(value: unknown): string | null { if (typeof value !== "string") return null; const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function boundedLimit(value: number | undefined): number { const parsed = Math.trunc(value ?? 100); return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 100; }
function nonNegativeInteger(value: number): number { const parsed = Math.trunc(value); if (!Number.isFinite(parsed) || parsed < 0) throw new IntegrationValidationError("1C document cursor is invalid."); return parsed; }
function parseCursor(value: string | null | undefined): { sourceIndex: number; skip: number } { const match = /^(\d+):(\d+)$/.exec(value ?? "0:0"); if (!match) throw new IntegrationValidationError("1C document cursor is invalid."); return { sourceIndex: Number(match[1]), skip: Number(match[2]) }; }
