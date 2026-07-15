import type { OrderProvider } from "../../contracts";
import type {
  IntegrationPageResultDTO,
  SalesOrderDTO,
  SalesOrderExportResultDTO,
  SalesOrderHistoryDTO,
  SalesOrderHistoryStateCode,
} from "../../dto";
import { normalizeOneCCurrencyCode } from "./one-c-currency";
import {
  IntegrationForbiddenError,
  IntegrationHttpError,
  IntegrationProviderUnavailableError,
  IntegrationTimeoutError,
  IntegrationUnauthorizedError,
  IntegrationValidationError,
} from "../../errors";
import type { OneCProviderConfig } from "./one-c-provider.config";

const CUSTOMER_ORDER_RESOURCE = "Document_ЗаказПокупателя";
const CUSTOMER_ORDER_TYPE = "StandardODATA.Document_ЗаказПокупателя";
const PRODUCT_TYPE = "StandardODATA.Catalog_Номенклатура";
const UNIT_TYPE = "StandardODATA.Catalog_КлассификаторЕдиницИзмерения";

export type OneCCustomerOrderPayload =
  | ReturnType<typeof buildOneCCustomerOrderPayload>
  | ReturnType<typeof buildLegacyMinimalOneCCustomerOrderPayload>;

export class OneCCustomerOrderProvider implements OrderProvider {
  private readonly stateCache = new Map<string, Promise<SalesOrderHistoryStateCode | null>>();
  private readonly currencyCache = new Map<string, Promise<string | null>>();

  constructor(private readonly config: OneCProviderConfig) {}

  async exportSalesOrder(order: SalesOrderDTO): Promise<SalesOrderExportResultDTO> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) {
      throw new IntegrationProviderUnavailableError("1C order export is not configured.");
    }
    const url = new URL(`${baseUrl.replace(/\/$/, "")}/${CUSTOMER_ORDER_RESOURCE}`);
    url.searchParams.set("$format", "json");
    const payload = this.config.useLegacyMinimalOrderPayload
      ? buildLegacyMinimalOneCCustomerOrderPayload(order)
      : buildOneCCustomerOrderPayload(order);

    console.info({
      event: "one_c_customer_order_request",
      stage: "one_c_http_request",
      resource: CUSTOMER_ORDER_RESOURCE,
      submissionKey: order.portalOrderReference,
      payload,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      console.error({
        event: "one_c_customer_order_failed",
        stage: "one_c_http_request",
        resource: CUSTOMER_ORDER_RESOURCE,
        submissionKey: order.portalOrderReference,
        errorType: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : null,
      });
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new IntegrationTimeoutError("1C customer order creation timed out.");
      }
      throw new IntegrationProviderUnavailableError("1C customer order creation is unavailable.");
    }

    const responseBody = await response.text();
    const responseDiagnostic = {
      event: "one_c_customer_order_response",
      stage: "one_c_http_response",
      resource: CUSTOMER_ORDER_RESOURCE,
      submissionKey: order.portalOrderReference,
      httpStatus: response.status,
      responseBody,
    };
    if (response.ok) console.info(responseDiagnostic);
    else console.error(responseDiagnostic);

    if (response.status === 401) throw new IntegrationUnauthorizedError();
    if (response.status === 403) throw new IntegrationForbiddenError();
    if (response.status >= 500) throw new IntegrationProviderUnavailableError("1C customer order result is uncertain.");
    if (!response.ok) throw new IntegrationHttpError();

    let value: unknown;
    try {
      value = JSON.parse(responseBody);
    } catch {
      console.error({
        event: "one_c_customer_order_failed",
        stage: "one_c_response_validation",
        resource: CUSTOMER_ORDER_RESOURCE,
        submissionKey: order.portalOrderReference,
        httpStatus: response.status,
        responseBody,
      });
      throw new IntegrationValidationError("1C returned an invalid customer order response.");
    }
    if (!isCreatedOrderResponse(value) || value.Posted === true) {
      console.error({
        event: "one_c_customer_order_failed",
        stage: "one_c_response_validation",
        resource: CUSTOMER_ORDER_RESOURCE,
        submissionKey: order.portalOrderReference,
        httpStatus: response.status,
        responseBody,
      });
      throw new IntegrationValidationError("1C returned an invalid customer order response.");
    }

    const verifiedOrder = await readBackCreatedOrder(this.config, order, value.Ref_Key);

    return {
      orderReference: { providerCode: "one-c", externalId: verifiedOrder.Ref_Key, externalType: CUSTOMER_ORDER_TYPE },
      orderNumber: verifiedOrder.Number,
      documentDate: new Date(verifiedOrder.Date).toISOString(),
      status: "unposted",
      exportedAt: new Date().toISOString(),
      requestedDeliveryDate: order.requestedDeliveryDate,
      documentTotal: Number(verifiedOrder.СуммаДокумента),
      itemCount: order.items.length,
      totalUnits: order.items.reduce((total, item) => total + item.quantity, 0),
    };
  }

  async findExportedSalesOrders(order: SalesOrderDTO): Promise<SalesOrderExportResultDTO[]> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) {
      throw new IntegrationProviderUnavailableError("1C order reconciliation is not configured.");
    }
    const url = new URL(`${baseUrl.replace(/\/$/, "")}/${CUSTOMER_ORDER_RESOURCE}`);
    url.searchParams.set("$select", readBackFields);
    url.searchParams.set("$filter", `substringof('${escapeODataLiteral(order.portalOrderReference)}',Комментарий) eq true`);
    url.searchParams.set("$top", "3");
    url.searchParams.set("$format", "json");

    const response = await fetchOneC(this.config, url, "1C order reconciliation is unavailable.");
    const responseBody = await response.text();
    if (!response.ok) throw new IntegrationProviderUnavailableError("1C order reconciliation is unavailable.");

    let value: unknown;
    try {
      value = JSON.parse(responseBody);
    } catch {
      throw new IntegrationValidationError("1C order reconciliation returned invalid JSON.");
    }
    if (!isOrderCollection(value)) {
      throw new IntegrationValidationError("1C order reconciliation returned an invalid response.");
    }

    return value.value
      .filter((candidate) => candidate.Комментарий?.includes(order.portalOrderReference))
      .filter((candidate) => isVerifiedOrderReadBack(candidate, order, candidate.Ref_Key))
      .map((candidate) => toExportResult(candidate, order));
  }

  async fetchSalesOrders(): Promise<IntegrationPageResultDTO<SalesOrderDTO>> {
    throw new IntegrationValidationError("1C customer order import is not implemented.");
  }

  async fetchSalesOrderHistory(
    input: Parameters<OrderProvider["fetchSalesOrderHistory"]>[0],
  ): Promise<IntegrationPageResultDTO<SalesOrderHistoryDTO>> {
    const partnerRef = input.partnerCompanyReference?.externalId.trim();
    if (!partnerRef || !isOneCGuid(partnerRef)) {
      throw new IntegrationValidationError("1C counterparty reference is invalid.");
    }

    const limit = Math.min(Math.max(input.page?.limit ?? 100, 1), 250);
    const skip = parseHistoryCursor(input.page?.cursor);
    const url = new URL(`${requiredBaseUrl(this.config)}/${CUSTOMER_ORDER_RESOURCE}`);
    url.searchParams.set("$filter", `Контрагент_Key eq guid'${partnerRef}'`);
    url.searchParams.set("$select", HISTORY_ORDER_FIELDS);
    url.searchParams.set("$orderby", "Date asc,Ref_Key asc");
    url.searchParams.set("$top", String(limit));
    url.searchParams.set("$skip", String(skip));
    url.searchParams.set("$format", "json");

    const response = await fetchOneC(this.config, url, "1C order history is unavailable.");
    const responseBody = await response.text();
    if (!response.ok) throw historyHttpError(response.status);

    let envelope: unknown;
    try {
      envelope = JSON.parse(responseBody);
    } catch {
      throw new IntegrationValidationError("1C order history returned invalid JSON.");
    }
    if (!isHistoryEnvelope(envelope)) {
      throw new IntegrationValidationError("1C order history returned an invalid response.");
    }

    const rows = envelope.value.flatMap((row, index) => {
      const parsed = parseHistoryRow(row, partnerRef);
      if (!parsed) {
        console.warn({
          event: "one_c_order_history_row_skipped",
          resource: CUSTOMER_ORDER_RESOURCE,
          pageOffset: skip,
          rowIndex: index,
          reason: "invalid_shape",
        });
        return [];
      }
      return [parsed];
    });
    const items = await Promise.all(rows.map((row) => this.resolveHistoryRow(row)));

    return {
      items,
      nextCursor: envelope.value.length === limit ? String(skip + limit) : null,
    };
  }

  private async resolveHistoryRow(row: ParsedHistoryRow): Promise<SalesOrderHistoryDTO> {
    const [stateCode, currencyCode] = await Promise.all([
      row.stateRaw ? this.resolveStateCode(row.stateRaw) : Promise.resolve(null),
      row.currencyRef ? this.resolveCurrencyCode(row.currencyRef) : Promise.resolve(null),
    ]);
    return { ...row.dto, stateCode, currencyCode };
  }

  private resolveStateCode(reference: string): Promise<SalesOrderHistoryStateCode | null> {
    const cached = this.stateCache.get(reference);
    if (cached) return cached;
    const request = this.fetchStateCode(reference);
    this.stateCache.set(reference, request);
    return request;
  }

  private async fetchStateCode(reference: string): Promise<SalesOrderHistoryStateCode | null> {
    const row = await fetchOneCReference(this.config, "Catalog_СостоянияЗаказовПокупателей", reference);
    const description = typeof row.Description === "string" ? row.Description.trim() : "";
    const stateCode = ORDER_STATE_CODES[description] ?? null;
    if (!stateCode) {
      console.warn({ event: "one_c_order_state_unmapped", stateReference: reference, description });
    }
    return stateCode;
  }

  private resolveCurrencyCode(reference: string): Promise<string | null> {
    const cached = this.currencyCache.get(reference);
    if (cached) return cached;
    const request = this.fetchCurrencyCode(reference);
    this.currencyCache.set(reference, request);
    return request;
  }

  private async fetchCurrencyCode(reference: string): Promise<string | null> {
    const row = await fetchOneCReference(this.config, "Catalog_Валюты", reference);
    const raw = typeof row.Code === "string" && row.Code.trim()
      ? row.Code.trim()
      : typeof row.Description === "string" ? row.Description.trim() : "";
    return raw ? normalizeOneCCurrencyCode(raw) : null;
  }
}

const HISTORY_ORDER_FIELDS = [
  "Ref_Key",
  "Number",
  "Date",
  "Posted",
  "DeletionMark",
  "Контрагент_Key",
  "Договор_Key",
  "ДатаОтгрузки",
  "СуммаДокумента",
  "ВалютаДокумента_Key",
  "СостояниеЗаказа",
  "СостояниеЗаказа_Type",
  "DataVersion",
  "Запасы",
].join(",");

const ORDER_STATE_CODES: Readonly<Record<string, SalesOrderHistoryStateCode>> = {
  "Открыт": "open",
  "Предзаказ": "preorder",
  "Тест": "test",
  "Завершен": "completed",
};

type ParsedHistoryRow = {
  stateRaw: string | null;
  currencyRef: string | null;
  dto: Omit<SalesOrderHistoryDTO, "stateCode" | "currencyCode">;
};

function parseHistoryRow(value: unknown, partnerRef: string): ParsedHistoryRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const reference = stringValue(row.Ref_Key);
  const counterpartyRef = stringValue(row["Контрагент_Key"]);
  const documentDate = dateValue(row.Date);
  const number = stringValue(row.Number);
  const total = finiteNumber(row["СуммаДокумента"]);
  if (
    !isOneCGuid(reference) ||
    counterpartyRef.toLowerCase() !== partnerRef.toLowerCase() ||
    !documentDate ||
    typeof row.Posted !== "boolean" ||
    typeof row.DeletionMark !== "boolean" ||
    total === null || total < 0 ||
    !Array.isArray(row["Запасы"])
  ) {
    return null;
  }

  const items = row["Запасы"].flatMap((item, index) => {
    const parsed = parseHistoryItem(item, index + 1);
    return parsed ? [parsed] : [];
  });
  const stateRaw = nullableOneCGuid(row["СостояниеЗаказа"]);
  const currencyRef = nullableOneCGuid(row["ВалютаДокумента_Key"]);
  const contractRef = nullableOneCGuid(row["Договор_Key"]);

  return {
    stateRaw,
    currencyRef,
    dto: {
      reference: externalReference(reference, "customer-order"),
      partnerCompanyReference: externalReference(counterpartyRef, "counterparty"),
      contractReference: contractRef ? externalReference(contractRef, "customer-contract") : null,
      currencyReference: currencyRef ? externalReference(currencyRef, "currency") : null,
      number,
      documentDate,
      requestedDeliveryDate: dateValue(row["ДатаОтгрузки"]),
      posted: row.Posted,
      deletionMark: row.DeletionMark,
      stateRaw,
      documentTotal: total,
      sourceVersion: nullableString(row.DataVersion),
      items,
    },
  };
}

function parseHistoryItem(value: unknown, fallbackLineNumber: number) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const productRef = stringValue(row["Номенклатура"]);
  const quantity = finiteNumber(row["Количество"]);
  const unitPrice = finiteNumber(row["Цена"]);
  const lineTotal = finiteNumber(row["Всего"] ?? row["Сумма"]);
  if (!isOneCGuid(productRef) || quantity === null || quantity <= 0 || unitPrice === null || unitPrice < 0 || lineTotal === null || lineTotal < 0) {
    return null;
  }
  const characteristicRef = nullableOneCGuid(row["Характеристика_Key"]);
  const sourceLine = Number.parseInt(stringValue(row.LineNumber), 10);
  return {
    lineNumber: Number.isFinite(sourceLine) && sourceLine > 0 ? sourceLine : fallbackLineNumber,
    productReference: externalReference(productRef, "catalog-product"),
    characteristicReference: characteristicRef ? externalReference(characteristicRef, "product-characteristic") : null,
    quantity,
    unitPrice,
    lineTotal,
  };
}

async function fetchOneCReference(
  config: OneCProviderConfig,
  resource: string,
  reference: string,
): Promise<Record<string, unknown>> {
  const url = new URL(`${requiredBaseUrl(config)}/${resource}(guid'${reference}')`);
  url.searchParams.set("$select", "Ref_Key,Code,Description,DeletionMark");
  url.searchParams.set("$format", "json");
  const response = await fetchOneC(config, url, "1C order reference data is unavailable.");
  if (!response.ok) throw historyHttpError(response.status);
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new IntegrationValidationError("1C order reference data is invalid.");
  }
  return body as Record<string, unknown>;
}

function historyHttpError(status: number): Error {
  if (status === 401) return new IntegrationUnauthorizedError();
  if (status === 403) return new IntegrationForbiddenError();
  if (status >= 500) return new IntegrationProviderUnavailableError("1C order history is unavailable.");
  return new IntegrationHttpError();
}

function requiredBaseUrl(config: OneCProviderConfig): string {
  if (!config.baseUrl || !config.username || !config.password) {
    throw new IntegrationProviderUnavailableError("1C order history is not configured.");
  }
  return config.baseUrl.replace(/\/$/, "");
}

function parseHistoryCursor(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new IntegrationValidationError("1C order history cursor is invalid.");
  }
  return parsed;
}

function isHistoryEnvelope(value: unknown): value is { value: unknown[] } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { value?: unknown }).value));
}

function isOneCGuid(value: string): boolean {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) &&
    value.toLowerCase() !== "00000000-0000-0000-0000-000000000000";
}

function nullableOneCGuid(value: unknown): string | null {
  const text = stringValue(value);
  return isOneCGuid(text) ? text.toLowerCase() : null;
}

function externalReference(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId: externalId.toLowerCase(), externalType };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value);
  return text || null;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateValue(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

async function readBackCreatedOrder(
  config: OneCProviderConfig,
  order: SalesOrderDTO,
  externalId: string,
): Promise<CreatedOrderResponse> {
  const url = new URL(
    `${config.baseUrl!.replace(/\/$/, "")}/${CUSTOMER_ORDER_RESOURCE}(guid'${externalId}')`,
  );
  url.searchParams.set("$select", readBackFields);
  url.searchParams.set("$format", "json");

  const response = await fetchOneC(config, url, "1C customer order read-back is unavailable.");

  const responseBody = await response.text();
  const diagnostic = {
    event: "one_c_customer_order_read_back",
    stage: "one_c_order_read_back",
    resource: CUSTOMER_ORDER_RESOURCE,
    submissionKey: order.portalOrderReference,
    httpStatus: response.status,
    responseBody,
  };
  if (response.ok) console.info(diagnostic);
  else console.error(diagnostic);

  if (!response.ok) {
    throw new IntegrationProviderUnavailableError(
      "1C customer order read-back is unavailable.",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(responseBody);
  } catch {
    throw new IntegrationProviderUnavailableError(
      "1C customer order read-back is invalid.",
    );
  }
  if (!isVerifiedOrderReadBack(value, order, externalId)) {
    throw new IntegrationProviderUnavailableError(
      "1C customer order read-back does not match the submitted order.",
    );
  }
  return value;
}

export function buildOneCCustomerOrderPayload(order: SalesOrderDTO) {
  return {
    Date: new Date().toISOString(),
    Posted: false,
    Контрагент_Key: order.partnerCompanyReference.externalId,
    Договор_Key: order.contractReference.externalId,
    Автор_Key: order.authorReference.externalId,
    Организация_Key: order.organizationReference.externalId,
    ВидЦен_Key: order.priceTypeReference.externalId,
    ВалютаДокумента_Key: order.currencyReference.externalId,
    Курс: 1,
    Кратность: 1,
    СостояниеЗаказа: order.orderStateReference.externalId,
    СтруктурнаяЕдиницаПродажи_Key: order.salesStructuralUnitReference.externalId,
    СтруктурнаяЕдиницаРезерв_Key: order.reservationStructuralUnitReference.externalId,
    ВидОперации: "ЗаказНаПродажу",
    СпособДоставки: "Самовывоз",
    ТипДенежныхСредств: "Безналичные",
    НалогообложениеНДС: "ОблагаетсяНДС",
    НДСВключатьВСтоимость: true,
    СуммаВключаетНДС: true,
    УчитыватьВНУ: true,
    ДатаОтгрузки: order.requestedDeliveryDate,
    СуммаДокумента: roundMoney(order.documentTotal),
    Комментарий: order.comment,
    Запасы: order.items.map((item, index) => ({
      Номенклатура: item.productReference.externalId,
      Номенклатура_Type: PRODUCT_TYPE,
      Характеристика_Key: item.characteristicReference.externalId,
      ЕдиницаИзмерения: item.unitReference.externalId,
      ЕдиницаИзмерения_Type: UNIT_TYPE,
      Цена: item.price?.amount,
      Количество: item.quantity,
      Сумма: roundMoney(item.lineTotal),
      Всего: roundMoney(item.lineTotal),
      СтавкаНДС_Key: item.vatRateReference.externalId,
      СуммаНДС: 0,
      ДатаОтгрузки: order.requestedDeliveryDate,
      СтруктурнаяЕдиницаРезерв_Key: order.reservationStructuralUnitReference.externalId,
      ТипНоменклатурыЗапас: true,
      Резерв: 0,
      РезервОтгрузка: 0,
      КлючСвязи: index + 1,
    })),
  };
}

export function buildLegacyMinimalOneCCustomerOrderPayload(
  order: SalesOrderDTO,
  now = new Date(),
) {
  const requestedDeliveryDate = toOneCDateTime(order.requestedDeliveryDate);

  return {
    Date: toOneCDateTime(now),
    ДатаОтгрузки: requestedDeliveryDate,
    Контрагент_Key: order.partnerCompanyReference.externalId,
    Договор_Key: order.contractReference.externalId,
    Кратность: 1,
    СуммаДокумента: roundMoney(order.documentTotal),
    СпособДоставки: "Самовывоз",
    Комментарий: order.comment,
    Запасы: order.items.map((item, index) => ({
      СтавкаНДС_Key: item.vatRateReference.externalId,
      LineNumber: index + 1,
      ТипНоменклатурыЗапас: true,
      Номенклатура: item.productReference.externalId,
      Номенклатура_Type: PRODUCT_TYPE,
      Характеристика_Key: item.characteristicReference.externalId,
      ЕдиницаИзмерения: item.unitReference.externalId,
      ЕдиницаИзмерения_Type: UNIT_TYPE,
      Цена: item.price?.amount,
      Сумма: item.price?.amount,
      Количество: item.quantity,
      Всего: roundMoney(item.lineTotal),
    })),
  };
}

function toOneCDateTime(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00`;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new IntegrationValidationError("1C customer order date is invalid.");
  }
  return parsed.toISOString().slice(0, 19);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isCreatedOrderResponse(value: unknown): value is { Ref_Key: string; Number: string; Date: string; Posted?: boolean } {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.Ref_Key === "string" && /^[0-9a-f-]{36}$/i.test(row.Ref_Key)
    && typeof row.Number === "string" && row.Number.trim().length > 0
    && typeof row.Date === "string" && Number.isFinite(Date.parse(row.Date))
    && (row.Posted === undefined || typeof row.Posted === "boolean");
}

type CreatedOrderResponse = {
  Ref_Key: string;
  Number: string;
  Date: string;
  Posted: boolean;
  Контрагент_Key?: string;
  Договор_Key?: string;
  ДатаОтгрузки?: string;
  СуммаДокумента?: number | string;
  Комментарий?: string;
  Запасы?: unknown[];
};

const readBackFields = "Ref_Key,Number,Date,Posted,Контрагент_Key,Договор_Key,ДатаОтгрузки,СуммаДокумента,Комментарий,Запасы";

function isVerifiedOrderReadBack(
  value: unknown,
  order: SalesOrderDTO,
  externalId: string,
): value is CreatedOrderResponse {
  if (!isCreatedOrderResponse(value) || value.Posted !== false) return false;
  const row = value as CreatedOrderResponse;
  if (
    row.Ref_Key.toLowerCase() !== externalId.toLowerCase() ||
    row.Контрагент_Key?.toLowerCase() !== order.partnerCompanyReference.externalId.toLowerCase() ||
    row.Договор_Key?.toLowerCase() !== order.contractReference.externalId.toLowerCase() ||
    normalizeOneCDate(row.ДатаОтгрузки) !== normalizeOneCDate(order.requestedDeliveryDate) ||
    !moneyEquals(Number(row.СуммаДокумента), order.documentTotal) ||
    !Array.isArray(row.Запасы) ||
    row.Запасы.length !== order.items.length
  ) {
    return false;
  }

  const unmatched = [...row.Запасы];
  return order.items.every((expected) => {
    const matchIndex = unmatched.findIndex((item) => {
      if (!item || typeof item !== "object") return false;
      const actual = item as Record<string, unknown>;
      return actual.Номенклатура === expected.productReference.externalId &&
        Number(actual.Количество) === expected.quantity &&
        moneyEquals(Number(actual.Цена), expected.price?.amount ?? Number.NaN);
    });
    if (matchIndex < 0) return false;
    unmatched.splice(matchIndex, 1);
    return true;
  });
}

async function fetchOneC(config: OneCProviderConfig, url: URL, message: string): Promise<Response> {
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`, "utf8").toString("base64")}`,
      },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new IntegrationTimeoutError(message);
    }
    throw new IntegrationProviderUnavailableError(message);
  }
}

function isOrderCollection(value: unknown): value is { value: CreatedOrderResponse[] } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { value?: unknown }).value));
}

function toExportResult(order: CreatedOrderResponse, expected: SalesOrderDTO): SalesOrderExportResultDTO {
  return {
    orderReference: { providerCode: "one-c", externalId: order.Ref_Key, externalType: CUSTOMER_ORDER_TYPE },
    orderNumber: order.Number,
    documentDate: new Date(order.Date).toISOString(),
    status: "unposted",
    exportedAt: new Date().toISOString(),
    requestedDeliveryDate: expected.requestedDeliveryDate,
    documentTotal: Number(order.СуммаДокумента),
    itemCount: expected.items.length,
    totalUnits: expected.items.reduce((total, item) => total + item.quantity, 0),
  };
}

function normalizeOneCDate(value: string | undefined): string | null {
  if (!value) return null;
  const calendarDate = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(value)?.[1];
  if (calendarDate) return calendarDate;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function moneyEquals(left: number, right: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.005;
}

function escapeODataLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
