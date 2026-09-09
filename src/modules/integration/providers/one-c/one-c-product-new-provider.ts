import { IntegrationValidationError } from "../../errors";
import { isOneCGuid } from "./one-c-guid";
import { OneCODataClient } from "./one-c-odata-client";

const CREATION_REQUISITE_RESOURCE = "Catalog_Номенклатура_ДополнительныеРеквизиты";
const RECEIPT_RESOURCE = "Document_ПриходнаяНакладная";
const RECEIPT_LINE_RESOURCE = "Document_ПриходнаяНакладная_Запасы";
const CREATION_REQUISITE_REF = "cb442472-ac8c-11f1-639c-bc2411369b92";
const RECEIPT_OPERATION = "ПоступлениеОтПоставщика";
const PAGE_SIZE = 500;
const MAX_PAGES = 2_000;
const RECEIPT_BATCH_SIZE = 20;

type ODataReader = Pick<OneCODataClient, "get">;
type Row = Record<string, unknown>;

export type ProductNewSourceStatus =
  | "ready"
  | "missing_creation"
  | "invalid_creation"
  | "missing_market_entry"
  | "market_entry_before_creation"
  | "future_market_entry";

export type ProductNewSourceFact = {
  productExternalId: string;
  sourceCreatedAt: string | null;
  marketEntryAt: string | null;
  marketEntryReceiptRef: string | null;
  eligibleReceiptCount: number;
  sourceStatus: ProductNewSourceStatus;
};

export type OneCProductNewSnapshot = {
  facts: ProductNewSourceFact[];
  businessDate: string;
  totalCatalogProducts: number;
  totalCreationRequisiteRows: number;
  totalEligibleReceipts: number;
  totalEligibleReceiptLines: number;
  creationRequisitePageCount: number;
  receiptHeaderPageCount: number;
  receiptLinePageCount: number;
};

type ReceiptHeader = { reference: string; date: string };

export class ProductNewSourceScanIncompleteError extends IntegrationValidationError {
  readonly failedStage = "automated_new_source_scan";
  readonly errorCategory = "scan_incomplete";

  constructor(resource: string) {
    super(`1C automated NEW scan is incomplete for ${resource}.`);
    this.name = "ProductNewSourceScanIncompleteError";
  }
}

export class OneCProductNewProvider {
  private readonly client: ODataReader;

  constructor(input: ODataReader | {
    baseUrl: string | null;
    username: string | null;
    password: string | null;
    requestTimeoutMs: number;
  }) {
    this.client = "get" in input ? input : new OneCODataClient(input);
  }

  async fetchSnapshot(
    productExternalIds: readonly string[],
    now = new Date(),
  ): Promise<OneCProductNewSnapshot> {
    const productRefs = normalizeProductReferences(productExternalIds);
    const businessDate = chisinauBusinessDate(now);
    const creation = await this.fetchCreationRequisites();
    const receipts = await this.fetchEligibleReceipts();
    const lines = await this.fetchEligibleReceiptLines(receipts.items, productRefs);
    const creationByProduct = collectCreationDates(creation.items, productRefs);
    const marketEntryByProduct = collectMarketEntries(lines.items, receipts.items, productRefs);

    return {
      facts: [...productRefs].sort().map((productExternalId) => {
        const sourceCreatedAt = creationByProduct.valid.get(productExternalId) ?? null;
        const marketEntry = marketEntryByProduct.get(productExternalId) ?? null;
        return {
          productExternalId,
          sourceCreatedAt,
          marketEntryAt: marketEntry?.date ?? null,
          marketEntryReceiptRef: marketEntry?.receiptRef ?? null,
          eligibleReceiptCount: marketEntry?.receiptRefs.size ?? 0,
          sourceStatus: sourceStatus({
            sourceCreatedAt,
            invalidCreation: creationByProduct.invalid.has(productExternalId),
            marketEntryAt: marketEntry?.date ?? null,
            businessDate,
          }),
        };
      }),
      businessDate,
      totalCatalogProducts: productRefs.size,
      totalCreationRequisiteRows: creation.items.length,
      totalEligibleReceipts: receipts.items.length,
      totalEligibleReceiptLines: lines.totalRows,
      creationRequisitePageCount: creation.pageCount,
      receiptHeaderPageCount: receipts.pageCount,
      receiptLinePageCount: lines.pageCount,
    };
  }

  private fetchCreationRequisites() {
    return this.fetchPages(
      CREATION_REQUISITE_RESOURCE,
      {
        "$filter": `Свойство_Key eq guid'${CREATION_REQUISITE_REF}'`,
        "$select": "Ref_Key,LineNumber,Свойство_Key,Значение,ТекстоваяСтрока,Значение_Type",
        "$orderby": "Ref_Key asc,LineNumber asc",
      },
      "automated_new_creation_requisite_scan",
    );
  }

  private async fetchEligibleReceipts(): Promise<{ items: ReceiptHeader[]; pageCount: number }> {
    const result = await this.fetchPages(
      RECEIPT_RESOURCE,
      {
        "$filter": `Posted eq true and DeletionMark eq false and PS_ЭтоИмпортТМЦ eq true and ВидОперации eq '${RECEIPT_OPERATION}'`,
        "$select": "Ref_Key,Number,Date,Posted,DeletionMark,ВидОперации,PS_ЭтоИмпортТМЦ",
        "$orderby": "Date asc,Ref_Key asc",
      },
      "automated_new_receipt_header_scan",
    );

    const items = result.items.flatMap((row): ReceiptHeader[] => {
      if (!isEligibleReceipt(row)) return [];
      const date = parseOneCLocalDateTime(row.Date);
      return date ? [{ reference: String(row.Ref_Key).toLowerCase(), date }] : [];
    });
    return { items, pageCount: result.pageCount };
  }

  private async fetchEligibleReceiptLines(
    receipts: readonly ReceiptHeader[],
    productRefs: ReadonlySet<string>,
  ): Promise<{ items: Row[]; pageCount: number; totalRows: number }> {
    const rows: Row[] = [];
    let pageCount = 0;
    let totalRows = 0;
    for (const receiptBatch of chunks(receipts.map((receipt) => receipt.reference), RECEIPT_BATCH_SIZE)) {
      const result = await this.fetchPages(
        RECEIPT_LINE_RESOURCE,
        {
          "$filter": receiptBatch.map((reference) => `Ref_Key eq guid'${reference}'`).join(" or "),
          "$select": "Ref_Key,LineNumber,Номенклатура_Key,Количество",
          "$orderby": "Ref_Key asc,LineNumber asc",
        },
        "automated_new_receipt_line_scan",
      );
      pageCount += result.pageCount;
      totalRows += result.items.length;
      for (const row of result.items) {
        if (productRefs.has(text(row["Номенклатура_Key"]).toLowerCase())) rows.push(row);
      }
    }
    return { items: rows, pageCount, totalRows };
  }

  private async fetchPages(
    resource: string,
    params: Record<string, string>,
    requestKind: string,
  ): Promise<{ items: Row[]; pageCount: number }> {
    const items: Row[] = [];
    const seenContinuations = new Set<string>();
    let nextParams: Record<string, string> = {
      ...params,
      "$top": String(PAGE_SIZE),
      "$skip": "0",
    };
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await this.client.get(resource, nextParams, { requestKind });
      const { continuationParams, values } = parseEnvelope(payload);
      items.push(...values);
      if (continuationParams) {
        const signature = new URLSearchParams(continuationParams).toString();
        if (seenContinuations.has(signature)) throw new ProductNewSourceScanIncompleteError(resource);
        seenContinuations.add(signature);
        nextParams = continuationParams;
        continue;
      }
      if (values.length < PAGE_SIZE) return { items, pageCount: page + 1 };
      nextParams = {
        ...params,
        "$top": String(PAGE_SIZE),
        "$skip": String((page + 1) * PAGE_SIZE),
      };
    }
    throw new ProductNewSourceScanIncompleteError(resource);
  }
}

function collectCreationDates(rows: Row[], productRefs: ReadonlySet<string>) {
  const candidates = new Map<string, Set<string>>();
  const invalid = new Set<string>();
  for (const row of rows) {
    const productRef = text(row.Ref_Key).toLowerCase();
    if (!productRefs.has(productRef) || text(row["Свойство_Key"]).toLowerCase() !== CREATION_REQUISITE_REF) continue;
    if (row["Значение_Type"] !== "Edm.DateTime") {
      invalid.add(productRef);
      continue;
    }
    const parsed = parseOneCLocalDateTime(row["Значение"]);
    if (!parsed) {
      invalid.add(productRef);
      continue;
    }
    const values = candidates.get(productRef) ?? new Set<string>();
    values.add(parsed);
    candidates.set(productRef, values);
  }
  const valid = new Map<string, string>();
  for (const [productRef, values] of candidates) {
    if (values.size === 1 && !invalid.has(productRef)) valid.set(productRef, [...values][0]!);
    else invalid.add(productRef);
  }
  return { valid, invalid };
}

function collectMarketEntries(
  rows: Row[],
  receipts: readonly ReceiptHeader[],
  productRefs: ReadonlySet<string>,
) {
  const receiptByRef = new Map(receipts.map((receipt) => [receipt.reference, receipt]));
  const result = new Map<string, { date: string; receiptRef: string; receiptRefs: Set<string> }>();
  for (const row of rows) {
    const receiptRef = text(row.Ref_Key).toLowerCase();
    const productRef = text(row["Номенклатура_Key"]).toLowerCase();
    const receipt = receiptByRef.get(receiptRef);
    if (!receipt || !productRefs.has(productRef)) continue;
    const current = result.get(productRef);
    if (!current) {
      result.set(productRef, { date: receipt.date, receiptRef, receiptRefs: new Set([receiptRef]) });
      continue;
    }
    current.receiptRefs.add(receiptRef);
    if (receipt.date < current.date || (receipt.date === current.date && receiptRef < current.receiptRef)) {
      current.date = receipt.date;
      current.receiptRef = receiptRef;
    }
  }
  return result;
}

function sourceStatus(input: {
  sourceCreatedAt: string | null;
  invalidCreation: boolean;
  marketEntryAt: string | null;
  businessDate: string;
}): ProductNewSourceStatus {
  if (input.invalidCreation) return "invalid_creation";
  if (!input.sourceCreatedAt) return "missing_creation";
  if (!input.marketEntryAt) return "missing_market_entry";
  if (input.marketEntryAt < input.sourceCreatedAt) return "market_entry_before_creation";
  if (input.marketEntryAt.slice(0, 10) > input.businessDate) return "future_market_entry";
  return "ready";
}

function isEligibleReceipt(row: Row): boolean {
  return typeof row.Ref_Key === "string"
    && isOneCGuid(row.Ref_Key)
    && row.Posted === true
    && row.DeletionMark === false
    && row["PS_ЭтоИмпортТМЦ"] === true
    && row["ВидОперации"] === RECEIPT_OPERATION;
}

function parseOneCLocalDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const utc = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  if (Number.isNaN(utc.getTime())
    || utc.getUTCFullYear() !== Number(year)
    || utc.getUTCMonth() + 1 !== Number(month)
    || utc.getUTCDate() !== Number(day)
    || utc.getUTCHours() !== Number(hour)
    || utc.getUTCMinutes() !== Number(minute)
    || utc.getUTCSeconds() !== Number(second)) return null;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function chisinauBusinessDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function normalizeProductReferences(values: readonly string[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!isOneCGuid(normalized)) throw new IntegrationValidationError("Catalog product has an invalid 1C reference.");
    result.add(normalized);
  }
  return result;
}

function parseEnvelope(value: unknown): { values: Row[]; continuationParams: Record<string, string> | null } {
  if (!isRecord(value) || !Array.isArray(value.value) || value.value.some((row) => !isRecord(row))) {
    throw new IntegrationValidationError("1C automated NEW response is invalid.");
  }
  const continuation = typeof value["@odata.nextLink"] === "string"
    ? value["@odata.nextLink"]
    : typeof value["odata.nextLink"] === "string" ? value["odata.nextLink"] : null;
  return {
    values: value.value as Row[],
    continuationParams: continuation ? parseContinuationParams(continuation) : null,
  };
}

function parseContinuationParams(value: string): Record<string, string> {
  let url: URL;
  try {
    url = new URL(value, "https://one-c.invalid/");
  } catch {
    throw new IntegrationValidationError("1C automated NEW continuation is invalid.");
  }
  const params = Object.fromEntries(url.searchParams.entries());
  if (!("$skip" in params) && !("$skiptoken" in params)) {
    throw new IntegrationValidationError("1C automated NEW continuation has no cursor.");
  }
  return params;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function isRecord(value: unknown): value is Row { return typeof value === "object" && value !== null && !Array.isArray(value); }
