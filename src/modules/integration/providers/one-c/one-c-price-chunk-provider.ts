import { IntegrationValidationError } from "../../errors";
import { ONE_C_ZERO_GUID, parseOneCGuid, parseRequiredOneCGuid } from "./one-c-guid";
import { OneCODataClient } from "./one-c-odata-client";

const PRICE_RESOURCE = "InformationRegister_\u0426\u0435\u043d\u044b\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u044b";
const PRICE_TYPE_RESOURCE = "Catalog_\u0412\u0438\u0434\u044b\u0426\u0435\u043d";
const CURRENCY_RESOURCE = "Catalog_\u0412\u0430\u043b\u044e\u0442\u044b";
const PRICE_FIELDS = ["Period", "\u0412\u0438\u0434\u0426\u0435\u043d_Key", "\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430_Key", "\u0425\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0430_Key", "\u0426\u0435\u043d\u0430", "\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c", "\u0415\u0434\u0438\u043d\u0438\u0446\u0430\u0418\u0437\u043c\u0435\u0440\u0435\u043d\u0438\u044f", "\u0412\u043a\u043b\u044e\u0447\u0430\u044f\u0425\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0438"].join(",");
const PRICE_TYPE_FIELDS = ["Ref_Key", "Code", "Description", "DeletionMark", "DataVersion", "\u0412\u0430\u043b\u044e\u0442\u0430\u0426\u0435\u043d\u044b_Key"].join(",");
const CURRENCY_FIELDS = ["Ref_Key", "Code", "Description", "DeletionMark"].join(",");

export type PriceRegisterStageRow = { externalProductRef: string; externalPriceTypeRef: string; externalCharacteristicRef: string; amount: number; isCurrent: boolean; effectiveAt: string };
export type PriceTypeStageRow = { externalRef: string; externalCode: string; name: string; currencyRef: string | null; sourceVersion: string | null; isActive: boolean };
export type CurrencyStageRow = { externalRef: string; code: string; name: string; isActive: boolean };
export type PriceSyncPage<T> = { items: T[]; rowCount: number };

export interface PriceChunkProvider {
  fetchPriceTypes(skip: number, limit: number): Promise<PriceSyncPage<PriceTypeStageRow>>;
  fetchCurrencies(skip: number, limit: number): Promise<PriceSyncPage<CurrencyStageRow>>;
  fetchPrices(skip: number, limit: number): Promise<PriceSyncPage<PriceRegisterStageRow>>;
}

export class OneCPriceChunkProvider implements PriceChunkProvider {
  private readonly client: OneCODataClient;
  constructor(config: { baseUrl: string | null; username: string | null; password: string | null; requestTimeoutMs: number }) { this.client = new OneCODataClient(config); }

  fetchPriceTypes(skip: number, limit: number) { return this.page(PRICE_TYPE_RESOURCE, PRICE_TYPE_FIELDS, "Ref_Key asc", skip, limit, mapPriceType); }
  fetchCurrencies(skip: number, limit: number) { return this.page(CURRENCY_RESOURCE, CURRENCY_FIELDS, "Ref_Key asc", skip, limit, mapCurrency); }
  fetchPrices(skip: number, limit: number) { return this.page(PRICE_RESOURCE, PRICE_FIELDS, "Period asc", skip, limit, mapPrice); }

  private async page<T>(resource: string, select: string, orderby: string, skip: number, limit: number, mapper: (value: unknown) => T | null): Promise<PriceSyncPage<T>> {
    const payload = await this.client.get(resource, { "$select": select, "$orderby": orderby, "$top": String(limit), "$skip": String(skip) }, { requestKind: "pricing_chunk_scan" });
    if (!isRecord(payload) || !Array.isArray(payload.value)) throw new IntegrationValidationError("1C pricing page is invalid.");
    return { items: payload.value.flatMap((value) => { const mapped = mapper(value); return mapped ? [mapped] : []; }), rowCount: payload.value.length };
  }
}

function mapPrice(value: unknown): PriceRegisterStageRow | null {
  if (!isRecord(value)) return null;
  const externalProductRef = parseRequiredOneCGuid(value["\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430_Key"]);
  const externalPriceTypeRef = parseRequiredOneCGuid(value["\u0412\u0438\u0434\u0426\u0435\u043d_Key"]);
  const externalCharacteristicRef = parseOneCGuid(value["\u0425\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0430_Key"]);
  if (!externalProductRef || !externalPriceTypeRef || !externalCharacteristicRef || typeof value.Period !== "string" || typeof value["\u0426\u0435\u043d\u0430"] !== "number") return null;
  return { externalProductRef, externalPriceTypeRef, externalCharacteristicRef, amount: value["\u0426\u0435\u043d\u0430"], isCurrent: value["\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c"] === true, effectiveAt: value.Period };
}
function mapPriceType(value: unknown): PriceTypeStageRow | null { if (!isRecord(value)) return null; const externalRef = parseRequiredOneCGuid(value.Ref_Key); if (!externalRef) return null; return { externalRef, externalCode: text(value.Code), name: text(value.Description), currencyRef: parseRequiredOneCGuid(value["\u0412\u0430\u043b\u044e\u0442\u0430\u0426\u0435\u043d\u044b_Key"]), sourceVersion: nullableText(value.DataVersion), isActive: value.DeletionMark !== true }; }
function mapCurrency(value: unknown): CurrencyStageRow | null { if (!isRecord(value)) return null; const externalRef = parseRequiredOneCGuid(value.Ref_Key); if (!externalRef) return null; return { externalRef, code: text(value.Code), name: text(value.Description), isActive: value.DeletionMark !== true }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown): string | null { return text(value) || null; }
export const PRICE_SYNC_ZERO_CHARACTERISTIC = ONE_C_ZERO_GUID;
export const ONE_C_PRICE_CHUNK_QUERY = { resource: PRICE_RESOURCE, select: PRICE_FIELDS, orderby: "Period asc" };
