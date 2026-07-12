import type { PricingProvider, ProductPriceFetchRequestDTO } from "../../contracts";
import type { IntegrationPageResultDTO, ProductPriceDTO } from "../../dto";
import { IntegrationValidationError } from "../../errors";
import { parseRequiredOneCGuid, parseOneCGuid, ONE_C_ZERO_GUID } from "./one-c-guid";
import { OneCODataClient } from "./one-c-odata-client";

const PRICE_RESOURCE = "InformationRegister_ЦеныНоменклатуры";
const PRICE_TYPE_RESOURCE = "Catalog_ВидыЦен";
const CURRENCY_RESOURCE = "Catalog_Валюты";
const PAGE_SIZE = 500;
const MAX_PAGES = 500;
const PRICE_FIELDS = ["Period", "ВидЦен_Key", "Номенклатура_Key", "Характеристика_Key", "Цена", "Актуальность", "ЕдиницаИзмерения", "ВключаяХарактеристики"].join(",");
const PRICE_TYPE_FIELDS = ["Ref_Key", "Code", "Description", "DeletionMark", "DataVersion", "ВалютаЦены_Key"].join(",");
const CURRENCY_FIELDS = ["Ref_Key", "Code", "Description", "DeletionMark"].join(",");

type Row = { period: string; priceTypeRef: string; productRef: string; characteristicRef: string; amount: number; active: boolean };
type PriceType = { ref: string; code: string; name: string; currencyRef: string | null; sourceVersion: string | null };

export class OneCPriceODataProvider implements PricingProvider {
  private readonly client: OneCODataClient;
  private snapshot: Promise<ProductPriceDTO[]> | null = null;
  constructor(config: { baseUrl: string | null; username: string | null; password: string | null; requestTimeoutMs: number }) { this.client = new OneCODataClient(config); }

  async fetchProductPrices(_input: ProductPriceFetchRequestDTO): Promise<IntegrationPageResultDTO<ProductPriceDTO>> {
    this.snapshot ??= this.loadSnapshot();
    return { items: await this.snapshot, nextCursor: null };
  }

  private async loadSnapshot(): Promise<ProductPriceDTO[]> {
    const [rows, priceTypes, currencies] = await Promise.all([this.scanPrices(), this.scanPriceTypes(), this.scanCurrencies()]);
    const latest = new Map<string, Row>();
    for (const row of rows) { const key = `${row.productRef}:${row.priceTypeRef}:${row.characteristicRef}`; const current = latest.get(key); if (!current || Date.parse(row.period) > Date.parse(current.period)) latest.set(key, row); }
    return [...latest.values()].filter((row) => row.characteristicRef === ONE_C_ZERO_GUID).flatMap((row) => {
      const type = priceTypes.get(row.priceTypeRef); if (!type) return [];
      const currency = type.currencyRef ? currencies.get(type.currencyRef) ?? null : null;
      return [{ reference: ref(`${row.productRef}:${row.priceTypeRef}`, "product-price"), productReference: ref(row.productRef, "catalog-product"), partnerCompanyReference: null, priceTypeReference: ref(row.priceTypeRef, "price-type"), priceTypeCode: type.code, priceTypeName: type.name, money: { currency: currency ?? "XXX", amount: row.amount }, currencyStatus: currency ? "resolved" as const : "unresolved" as const, validFrom: row.period, validTo: null, isActive: row.active && row.amount > 0, metadata: { sourceReference: ref(`${row.productRef}:${row.priceTypeRef}`, "product-price"), sourceUpdatedAt: row.period, importedAt: null, sourceVersion: type.sourceVersion } }];
    });
  }

  private async scanPrices(): Promise<Row[]> { return this.scan(PRICE_RESOURCE, PRICE_FIELDS, "Period asc", (value) => { if (!record(value)) return null; const productRef = parseRequiredOneCGuid(value["Номенклатура_Key"]); const priceTypeRef = parseRequiredOneCGuid(value["ВидЦен_Key"]); const characteristicRef = parseOneCGuid(value["Характеристика_Key"]); if (!productRef || !priceTypeRef || !characteristicRef || typeof value.Period !== "string" || typeof value["Цена"] !== "number") return null; return { period: value.Period, priceTypeRef, productRef, characteristicRef, amount: value["Цена"], active: value["Актуальность"] === true }; }); }
  private async scanPriceTypes(): Promise<Map<string, PriceType>> { const rows = await this.scan(PRICE_TYPE_RESOURCE, PRICE_TYPE_FIELDS, "Ref_Key asc", (value) => { if (!record(value) || value.DeletionMark === true) return null; const refValue = parseRequiredOneCGuid(value.Ref_Key); if (!refValue) return null; return { ref: refValue, code: text(value.Code), name: text(value.Description), currencyRef: parseRequiredOneCGuid(value["ВалютаЦены_Key"]), sourceVersion: nullableText(value.DataVersion) }; }); return new Map(rows.map((row) => [row.ref, row])); }
  private async scanCurrencies(): Promise<Map<string, string>> { const rows = await this.scan(CURRENCY_RESOURCE, CURRENCY_FIELDS, "Ref_Key asc", (value) => { if (!record(value) || value.DeletionMark === true) return null; const refValue = parseRequiredOneCGuid(value.Ref_Key); const code = text(value.Code); return refValue && code ? [refValue, code] as const : null; }); return new Map(rows); }
  private async scan<T>(resource: string, select: string, orderby: string, map: (value: unknown) => T | null): Promise<T[]> { const result: T[] = []; for (let page = 0; page < MAX_PAGES; page += 1) { const payload = await this.client.get(resource, { "$select": select, "$orderby": orderby, "$top": String(PAGE_SIZE), "$skip": String(page * PAGE_SIZE) }, { requestKind: "pricing_snapshot_scan" }); if (!record(payload) || !Array.isArray(payload.value)) throw new IntegrationValidationError("1C pricing response is invalid."); for (const value of payload.value) { const mapped = map(value); if (mapped) result.push(mapped); } if (payload.value.length < PAGE_SIZE) return result; } throw new IntegrationValidationError("1C pricing scan is incomplete."); }
}
function ref(externalId: string, externalType: string) { return { providerCode: "one-c", externalId, externalType }; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown): string | null { const valueText = text(value); return valueText || null; }
export const ONE_C_PRICE_QUERY = { resource: PRICE_RESOURCE, select: PRICE_FIELDS, orderby: "Period asc", pageSize: PAGE_SIZE };
