import type {
  CurrentProductPriceDTO,
  CurrentProductPriceFetchRequestDTO,
  PricingProvider,
  ProductPriceFetchRequestDTO,
} from "../../contracts";
import type { IntegrationPageResultDTO, ProductPriceDTO } from "../../dto";
import {
  IntegrationForbiddenError,
  IntegrationHttpError,
  IntegrationODataError,
  IntegrationProviderUnavailableError,
  IntegrationTimeoutError,
  IntegrationUnauthorizedError,
  IntegrationValidationError,
} from "../../errors";
import { parseRequiredOneCGuid, parseOneCGuid, ONE_C_ZERO_GUID } from "./one-c-guid";
import { OneCODataClient } from "./one-c-odata-client";

const PRICE_RESOURCE = "InformationRegister_ЦеныНоменклатуры";
const PRICE_TYPE_RESOURCE = "Catalog_ВидыЦен";
const CURRENCY_RESOURCE = "Catalog_Валюты";
const PAGE_SIZE = 500;
const MAX_PAGES = 500;
const TARGETED_PRICE_LIMIT = 500;
const PRICE_FIELDS = ["Period", "ВидЦен_Key", "Номенклатура_Key", "Характеристика_Key", "Цена", "Актуальность", "ЕдиницаИзмерения", "ВключаяХарактеристики"].join(",");
const PRICE_TYPE_FIELDS = ["Ref_Key", "Code", "Description", "DeletionMark", "DataVersion", "ВалютаЦены_Key"].join(",");
const CURRENCY_FIELDS = ["Ref_Key", "Code", "Description", "DeletionMark"].join(",");

type Row = { period: string; priceTypeRef: string; productRef: string; characteristicRef: string; amount: number; active: boolean };
type PriceType = { ref: string; code: string; name: string; currencyRef: string | null; sourceVersion: string | null };

export class OneCPriceODataProvider implements PricingProvider {
  private readonly client: OneCODataClient;
  private snapshot: Promise<ProductPriceDTO[]> | null = null;
  constructor(private readonly config: { baseUrl: string | null; username: string | null; password: string | null; requestTimeoutMs: number }) { this.client = new OneCODataClient(config); }

  async fetchProductPrices(input: ProductPriceFetchRequestDTO): Promise<IntegrationPageResultDTO<ProductPriceDTO>> {
    void input;
    this.snapshot ??= this.loadSnapshot();
    return { items: await this.snapshot, nextCursor: null };
  }

  async fetchCurrentProductPrices(
    input: CurrentProductPriceFetchRequestDTO,
  ): Promise<CurrentProductPriceDTO[]> {
    const productRefs = [...new Set(input.productReferences
      .map((value) => parseRequiredOneCGuid(value.externalId))
      .filter((value): value is string => value !== null))];
    const priceTypeRef = parseRequiredOneCGuid(input.priceTypeReference.externalId);
    if (!priceTypeRef || productRefs.length === 0 || productRefs.length > 100) {
      throw new IntegrationValidationError("Targeted 1C price request is invalid.");
    }

    const exactFinalUrl = buildTargetedCurrentPriceUrl(
      this.config.baseUrl,
      priceTypeRef,
      productRefs,
    );
    const payload = await this.fetchTargetedPriceRows(exactFinalUrl);
    const latest = new Map<string, Row>();
    for (const value of payload) {
      const row = mapTargetedRow(value);
      if (!row || row.priceTypeRef !== priceTypeRef || !productRefs.includes(row.productRef)) continue;
      const current = latest.get(row.productRef);
      if (!current || Date.parse(row.period) > Date.parse(current.period)) latest.set(row.productRef, row);
    }

    return [...latest.values()].map((row) => ({
      productReference: ref(row.productRef, "catalog-product"),
      priceTypeReference: ref(row.priceTypeRef, "price-type"),
      amount: row.amount,
      effectiveAt: row.period,
      isActive: row.active && row.amount > 0,
    }));
  }

  private async fetchTargetedPriceRows(exactFinalUrl: string): Promise<unknown[]> {
    const { username, password } = this.config;
    if (!username || !password) throw new IntegrationProviderUnavailableError("1C OData is not configured.");
    let response: Response;
    const startedAt = Date.now();
    try {
      response = await fetch(exactFinalUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
        },
        signal: AbortSignal.timeout(Math.min(this.config.requestTimeoutMs, 10_000)),
      });
    } catch (error) {
      console.error({
        event: "one_c_order_price_refresh_failed",
        statusCode: null,
        errorCategory: error instanceof Error ? error.name : typeof error,
        durationMs: Date.now() - startedAt,
      });
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new IntegrationTimeoutError("1C targeted price request timed out.");
      }
      throw new IntegrationProviderUnavailableError("1C targeted price request is unavailable.");
    }
    const body = await response.text();
    if (response.status === 401) {
      logTargetedPriceFailure(response.status, "unauthorized", startedAt);
      throw new IntegrationUnauthorizedError();
    }
    if (response.status === 403) {
      logTargetedPriceFailure(response.status, "forbidden", startedAt);
      throw new IntegrationForbiddenError();
    }
    let payload: unknown;
    try { payload = JSON.parse(body.replace(/^\uFEFF/, "")); }
    catch {
      logTargetedPriceFailure(response.status, "invalid_json", startedAt);
      throw new IntegrationValidationError("1C targeted price response is invalid.");
    }
    if (!response.ok) {
      if (record(payload) && ("error" in payload || "odata.error" in payload)) {
        logTargetedPriceFailure(response.status, "odata_error", startedAt);
        throw new IntegrationODataError();
      }
      logTargetedPriceFailure(response.status, "http_error", startedAt);
      throw new IntegrationHttpError();
    }
    if (!record(payload) || !Array.isArray(payload.value) || payload.value.length >= TARGETED_PRICE_LIMIT) {
      logTargetedPriceFailure(response.status, "invalid_shape", startedAt);
      throw new IntegrationValidationError("1C targeted price response is incomplete.");
    }
    console.info({
      event: "one_c_order_price_refresh_succeeded",
      statusCode: response.status,
      rowsReceived: payload.value.length,
      durationMs: Date.now() - startedAt,
    });
    return payload.value;
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

export function buildTargetedCurrentPriceUrl(
  baseUrl: string | null,
  priceTypeReference: string,
  productReferences: string[],
): string {
  if (!baseUrl) throw new IntegrationProviderUnavailableError("1C OData is not configured.");
  const priceTypeRef = parseRequiredOneCGuid(priceTypeReference);
  const productRefs = [...new Set(productReferences.map(parseRequiredOneCGuid)
    .filter((value): value is string => value !== null))];
  if (!priceTypeRef || productRefs.length === 0 || productRefs.length > 100) {
    throw new IntegrationValidationError("Targeted 1C price request is invalid.");
  }
  const productFilter = productRefs
    .map((value) => `Номенклатура_Key eq guid'${encodeURIComponent(value)}'`)
    .join(" or ");
  return `${baseUrl.replace(/\/$/, "")}/${PRICE_RESOURCE}`
    + `?$filter=ВидЦен_Key eq guid'${encodeURIComponent(priceTypeRef)}' and Характеристика_Key eq guid'${ONE_C_ZERO_GUID}' and (${productFilter})`
    + `&$select=${PRICE_FIELDS}&$top=${TARGETED_PRICE_LIMIT}&$format=json`;
}

function mapTargetedRow(value: unknown): Row | null {
  if (!record(value)) return null;
  const productRef = parseRequiredOneCGuid(value["Номенклатура_Key"]);
  const priceTypeRef = parseRequiredOneCGuid(value["ВидЦен_Key"]);
  const characteristicRef = parseOneCGuid(value["Характеристика_Key"]);
  const amount = Number(value["Цена"]);
  const period = typeof value.Period === "string" ? value.Period : "";
  if (!productRef || !priceTypeRef || characteristicRef !== ONE_C_ZERO_GUID
    || !Number.isFinite(amount) || !Number.isFinite(Date.parse(period))) return null;
  return { period, priceTypeRef, productRef, characteristicRef, amount, active: value["Актуальность"] === true };
}

function logTargetedPriceFailure(
  statusCode: number,
  errorCategory: string,
  startedAt: number,
): void {
  console.error({
    event: "one_c_order_price_refresh_failed",
    statusCode,
    errorCategory,
    durationMs: Date.now() - startedAt,
  });
}
function ref(externalId: string, externalType: string) { return { providerCode: "one-c", externalId, externalType }; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown): string | null { const valueText = text(value); return valueText || null; }
export const ONE_C_PRICE_QUERY = { resource: PRICE_RESOURCE, select: PRICE_FIELDS, orderby: "Period asc", pageSize: PAGE_SIZE };
