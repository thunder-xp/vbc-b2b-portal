import type { OrderProvider, SalesOrderHistoryPageResult } from "../../contracts";
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
const ORDER_STATE_RESOURCE = "Catalog_СостоянияЗаказовПокупателей";
const ORDER_STATE_TYPE = `StandardODATA.${ORDER_STATE_RESOURCE}`;
const CURRENCY_RESOURCE = "Catalog_Валюты";

export type OneCCustomerOrderPayload =
  | ReturnType<typeof buildOneCCustomerOrderPayload>
  | ReturnType<typeof buildLegacyMinimalOneCCustomerOrderPayload>;

export class OneCCustomerOrderProvider implements OrderProvider {
  private readonly stateCache = new Map<string, Promise<StateResolution>>();
  private readonly currencyCache = new Map<string, Promise<CurrencyResolution>>();

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
  ): Promise<SalesOrderHistoryPageResult> {
    const partnerRef = input.partnerCompanyReference?.externalId.trim();
    if (!partnerRef || !isOneCGuid(partnerRef)) {
      throw new IntegrationValidationError("1C counterparty reference is invalid.");
    }

    const limit = parseHistoryLimit(input.page?.limit);
    const skip = parseHistoryCursor(input.page?.cursor);
    const literalODataQuery =
      `$filter=Контрагент_Key eq guid'${partnerRef}'` +
      `&$select=${HISTORY_ORDER_FIELDS}` +
      `&$top=${limit}&$skip=${skip}&$format=json`;
    const exactFinalUrl = `${requiredBaseUrl(this.config)}/${CUSTOMER_ORDER_RESOURCE}?${literalODataQuery}`;

    console.info({
      event: "one_c_order_history_request",
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
      historyProviderImplementation: this.constructor.name,
      historyQueryMode: "scalar_headers_without_orderby",
      queryBuilderMode: "literal_1c_compatible",
      urlSearchParamsUsed: false,
      filterLiteralPreserved: true,
      headerIncludesInventoryLines: false,
      orderByApplied: false,
      resource: CUSTOMER_ORDER_RESOURCE,
      literalODataQuery,
      exactFinalUrl,
      requestUrl: exactFinalUrl,
      skip,
      top: limit,
    });

    let response: Response;
    try {
      response = await fetchOneC(this.config, exactFinalUrl, "1C order history is unavailable.");
    } catch (error) {
      console.error({
        event: "one_c_order_history_request_failed",
        stage: "odata_transport",
        resource: CUSTOMER_ORDER_RESOURCE,
        requestUrl: exactFinalUrl,
        skip,
        top: limit,
        ...safeErrorDiagnostic(error),
      });
      throw error;
    }
    const responseBody = await response.text();
    if (!response.ok) {
      console.error({
        event: "one_c_order_history_request_failed",
        stage: "odata_http",
        resource: CUSTOMER_ORDER_RESOURCE,
        requestUrl: exactFinalUrl,
        skip,
        top: limit,
        httpStatus: response.status,
        responseBody: safeODataErrorBody(responseBody),
      });
      throw historyHttpError(response.status);
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(responseBody);
    } catch (error) {
      console.error({
        event: "one_c_order_history_request_failed",
        stage: "odata_json",
        resource: CUSTOMER_ORDER_RESOURCE,
        requestUrl: exactFinalUrl,
        skip,
        top: limit,
        httpStatus: response.status,
        contentType: response.headers.get("content-type"),
        ...safeErrorDiagnostic(error),
      });
      throw new IntegrationValidationError("1C order history returned invalid JSON.");
    }
    if (!isHistoryEnvelope(envelope)) {
      console.error({
        event: "one_c_order_history_request_failed",
        stage: "odata_envelope",
        resource: CUSTOMER_ORDER_RESOURCE,
        requestUrl: exactFinalUrl,
        skip,
        top: limit,
        httpStatus: response.status,
        resultShape: describeODataShape(envelope),
      });
      throw new IntegrationValidationError("1C order history returned an invalid response.");
    }

    const parsedRows = envelope.value.map((row, index) => {
      const parsed = parseHistoryRow(row, partnerRef);
      if (!parsed) {
        console.error({
          event: "one_c_order_history_row_rejected",
          resource: CUSTOMER_ORDER_RESOURCE,
          pageOffset: skip,
          rowIndex: index,
          reason: "invalid_shape",
        });
        throw new IntegrationValidationError(`1C order history row ${index} is invalid.`);
      }
      return parsed;
    });
    const rowsByReference = new Map<string, ParsedHistoryRow>();
    let duplicateRowCount = 0;
    for (const row of parsedRows) {
      const reference = row.dto.reference.externalId.toLowerCase();
      if (rowsByReference.has(reference)) {
        duplicateRowCount += 1;
        console.warn({ event: "one_c_order_history_duplicate", resource: CUSTOMER_ORDER_RESOURCE, pageOffset: skip, orderRef: reference });
        continue;
      }
      rowsByReference.set(reference, row);
    }
    const rows = [...rowsByReference.values()];
    console.info({
      event: "one_c_order_history_page_received",
      resource: CUSTOMER_ORDER_RESOURCE,
      skip,
      top: limit,
      receivedRowCount: envelope.value.length,
      mappedRowCount: rows.length,
      firstRefKey: rows[0]?.dto.reference.externalId ?? null,
      lastRefKey: rows.at(-1)?.dto.reference.externalId ?? null,
    });
    const syncContext = input.historySyncContext ?? {
      syncId: "provider-only",
      page: Math.floor(skip / limit) + 1,
    };
    const stateReferences = [...new Set(rows.flatMap((row) => row.stateRef ? [row.stateRef] : []))];
    const currencyReferences = [...new Set(rows.flatMap((row) => row.currencyRef ? [row.currencyRef] : []))];
    const [stateEntries, currencyEntries] = await Promise.all([
      Promise.all(stateReferences.map(async (reference) => [reference, await this.resolveState(reference, syncContext)] as const)),
      Promise.all(currencyReferences.map(async (reference) => [reference, await this.resolveCurrency(reference, syncContext)] as const)),
    ]);
    const states = new Map(stateEntries);
    const currencies = new Map(currencyEntries);
    const enrichmentWarningCount = [...states.values(), ...currencies.values()]
      .filter((resolution) => resolution.warningReason !== null).length;
    console.info({
      event: "partner_order_history_page_enrichment_completed",
      syncId: syncContext.syncId,
      page: syncContext.page,
      stateReferenceCount: stateReferences.length,
      currencyReferenceCount: currencyReferences.length,
      warningCount: enrichmentWarningCount,
    });
    const items = await mapWithConcurrency(rows, HISTORY_LINE_CONCURRENCY, async (row, rowIndex) => {
      try {
        return await this.resolveHistoryRow(row, states, currencies, skip, rowIndex);
      } catch (error) {
        console.error({
          event: "one_c_order_history_mapping_failed",
          stage: "reference_resolution",
          resource: CUSTOMER_ORDER_RESOURCE,
          skip,
          rowIndex,
          orderRef: row.dto.reference.externalId,
          stateRef: row.stateRef,
          currencyRef: row.currencyRef,
          ...safeErrorDiagnostic(error),
        });
        throw error;
      }
    });

    return {
      items,
      nextCursor: envelope.value.length === limit ? String(skip + limit) : null,
      rawRowCount: envelope.value.length,
      mappedRowCount: items.length,
      rejectedRowCount: 0,
      lineRowCount: items.reduce((sum, item) => sum + item.items.length, 0),
      duplicateRowCount,
      enrichmentWarningCount,
    };
  }

  private async resolveHistoryRow(
    row: ParsedHistoryRow,
    states: ReadonlyMap<string, StateResolution>,
    currencies: ReadonlyMap<string, CurrencyResolution>,
    skip: number,
    rowIndex: number,
  ): Promise<SalesOrderHistoryDTO> {
    const items = row.dto.deletionMark
      ? []
      : await this.fetchHistoryLines(row.dto.reference.externalId, skip, rowIndex);
    return {
      ...row.dto,
      stateReference: row.stateRef ? externalReference(row.stateRef, "customer-order-state") : null,
      stateRaw: row.stateRef ? states.get(row.stateRef)?.description ?? null : null,
      stateCode: row.stateRef ? states.get(row.stateRef)?.code ?? "unknown" : null,
      currencyCode: row.currencyRef ? currencies.get(row.currencyRef)?.code ?? null : null,
      items,
    };
  }

  private async fetchHistoryLines(orderRef: string, skip: number, rowIndex: number): Promise<SalesOrderHistoryDTO["items"]> {
    const url = new URL(`${requiredBaseUrl(this.config)}/${CUSTOMER_ORDER_RESOURCE}(guid'${orderRef}')`);
    url.searchParams.set("$select", "Ref_Key,Запасы");
    url.searchParams.set("$format", "json");
    const response = await fetchOneC(this.config, url, "1C order lines are unavailable.");
    const responseBody = await response.text();
    if (!response.ok) {
      console.error({
        event: "one_c_order_history_lines_failed",
        stage: "line_http",
        resource: CUSTOMER_ORDER_RESOURCE,
        orderRef,
        pageOffset: skip,
        rowIndex,
        requestUrl: url.toString(),
        httpStatus: response.status,
        responseBody: safeODataErrorBody(responseBody),
      });
      throw historyHttpError(response.status);
    }
    let value: unknown;
    try {
      value = JSON.parse(responseBody);
    } catch (error) {
      console.error({ event: "one_c_order_history_lines_failed", stage: "line_json", orderRef, pageOffset: skip, rowIndex, ...safeErrorDiagnostic(error) });
      throw new IntegrationValidationError("1C order lines returned invalid JSON.");
    }
    if (!isRecordValue(value) || stringValue(value.Ref_Key).toLowerCase() !== orderRef.toLowerCase() || !Array.isArray(value["Запасы"])) {
      console.error({ event: "one_c_order_history_lines_failed", stage: "line_envelope", orderRef, pageOffset: skip, rowIndex, resultShape: describeODataShape(value) });
      throw new IntegrationValidationError("1C order lines returned an invalid response.");
    }
    return value["Запасы"].map((line, lineIndex) => {
      const parsed = parseHistoryItem(line, lineIndex + 1);
      if (!parsed) {
        console.error({
          event: "one_c_order_history_line_rejected",
          stage: "line_mapping",
          orderRef,
          pageOffset: skip,
          rowIndex,
          lineIndex,
          rejectedField: invalidHistoryItemField(line),
        });
        throw new IntegrationValidationError(`1C order line ${lineIndex} is invalid.`);
      }
      return parsed;
    });
  }

  private resolveState(reference: string, context: HistorySyncContext): Promise<StateResolution> {
    const cached = this.stateCache.get(reference);
    if (cached) {
      logReferenceCacheHit("state", ORDER_STATE_RESOURCE, reference, context, this.config);
      return cached;
    }
    const request = this.fetchState(reference, context);
    this.stateCache.set(reference, request);
    return request;
  }

  private async fetchState(reference: string, context: HistorySyncContext): Promise<StateResolution> {
    const result = await fetchHistoryReference(this.config, "state", ORDER_STATE_RESOURCE, reference, context);
    if (!result.row) return { code: "unknown", description: null, warningReason: result.warningReason };
    const row = result.row;
    const description = typeof row.Description === "string" ? row.Description.trim() : "";
    const stateCode = ORDER_STATE_CODES[normalizeStateDescription(description)] ?? "unknown";
    if (stateCode === "unknown") {
      console.warn({ event: "one_c_order_state_unmapped", stateReference: reference, description });
    }
    if (stateCode === "unknown") {
      logReferenceWarning("state", reference, context, result.exactFinalUrl, result.httpStatus,
        result.safeResponseBody, "unmapped_description", "odata_record", describeODataShape(row));
    }
    return {
      code: stateCode,
      description,
      warningReason: stateCode === "unknown" ? "unmapped_description" : null,
    };
  }

  private resolveCurrency(reference: string, context: HistorySyncContext): Promise<CurrencyResolution> {
    const cached = this.currencyCache.get(reference);
    if (cached) {
      logReferenceCacheHit("currency", CURRENCY_RESOURCE, reference, context, this.config);
      return cached;
    }
    const request = this.fetchCurrency(reference, context);
    this.currencyCache.set(reference, request);
    return request;
  }

  private async fetchCurrency(reference: string, context: HistorySyncContext): Promise<CurrencyResolution> {
    const result = await fetchHistoryReference(this.config, "currency", CURRENCY_RESOURCE, reference, context);
    if (!result.row) return { code: null, description: null, warningReason: result.warningReason };
    const row = result.row;
    const raw = typeof row.Code === "string" && row.Code.trim()
      ? row.Code.trim()
      : typeof row.Description === "string" ? row.Description.trim() : "";
    const code = raw ? normalizeOneCCurrencyCode(raw) : null;
    if (!code) {
      logReferenceWarning("currency", reference, context, result.exactFinalUrl, result.httpStatus,
        result.safeResponseBody, "unmapped_currency", "odata_record", describeODataShape(row));
    }
    return {
      code,
      description: typeof row.Description === "string" ? row.Description.trim() : null,
      warningReason: code ? null : "unmapped_currency",
    };
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
].join(",");

const HISTORY_LINE_CONCURRENCY = 5;

const ORDER_STATE_CODES: Readonly<Record<string, SalesOrderHistoryStateCode>> = {
  "открыт": "open",
  "предзаказ": "preorder",
  "тест": "test",
  "завершен": "completed",
};

type ParsedHistoryRow = {
  stateRef: string | null;
  currencyRef: string | null;
  dto: Omit<SalesOrderHistoryDTO, "stateReference" | "stateRaw" | "stateCode" | "currencyCode">;
};

type HistorySyncContext = {
  syncId: string;
  page: number;
};

type ReferenceKind = "state" | "currency";

type StateResolution = {
  code: SalesOrderHistoryStateCode;
  description: string | null;
  warningReason: string | null;
};

type CurrencyResolution = {
  code: string | null;
  description: string | null;
  warningReason: string | null;
};

type HistoryReferenceResult = {
  row: Record<string, unknown> | null;
  exactFinalUrl: string;
  httpStatus: number | null;
  safeResponseBody: string | null;
  warningReason: string | null;
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
    total === null || total < 0
  ) {
    return null;
  }

  const stateRef = nullableOneCGuid(row["СостояниеЗаказа"]);
  const currencyRef = nullableOneCGuid(row["ВалютаДокумента_Key"]);
  const contractRef = nullableOneCGuid(row["Договор_Key"]);

  return {
    stateRef,
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
      documentTotal: total,
      sourceVersion: nullableString(row.DataVersion),
      items: [],
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

function invalidHistoryItemField(value: unknown): string {
  if (!isRecordValue(value)) return "row";
  if (!isOneCGuid(stringValue(value["Номенклатура"]))) return "Номенклатура";
  const quantity = finiteNumber(value["Количество"]);
  if (quantity === null || quantity <= 0) return "Количество";
  const unitPrice = finiteNumber(value["Цена"]);
  if (unitPrice === null || unitPrice < 0) return "Цена";
  const lineTotal = finiteNumber(value["Всего"] ?? value["Сумма"]);
  if (lineTotal === null || lineTotal < 0) return "Всего";
  return "unknown";
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function mapWithConcurrency<TValue, TResult>(
  values: readonly TValue[],
  concurrency: number,
  mapper: (value: TValue, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(values.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

async function fetchHistoryReference(
  config: OneCProviderConfig,
  referenceKind: ReferenceKind,
  resource: string,
  reference: string,
  context: HistorySyncContext,
): Promise<HistoryReferenceResult> {
  const exactFinalUrl = buildHistoryReferenceUrl(config, resource, reference);
  console.info({
    event: "one_c_order_history_reference_lookup_started",
    syncId: context.syncId,
    page: context.page,
    referenceKind,
    referenceRef: reference,
    exactFinalUrl,
    cacheHit: false,
    expectedResponseShape: expectedReferenceShape(referenceKind),
  });

  let response: Response;
  try {
    response = await fetchOneC(config, exactFinalUrl, "1C order reference data is unavailable.");
  } catch (error) {
    logReferenceWarning(referenceKind, reference, context, exactFinalUrl, null, null,
      "transport_error", expectedReferenceShape(referenceKind), safeErrorDiagnostic(error));
    return { row: null, exactFinalUrl, httpStatus: null, safeResponseBody: null, warningReason: "transport_error" };
  }

  const responseBody = await response.text();
  const safeResponseBody = safeODataErrorBody(responseBody);
  if (!response.ok) {
    logReferenceWarning(referenceKind, reference, context, exactFinalUrl, response.status,
      safeResponseBody, "http_error", expectedReferenceShape(referenceKind), { responseType: "http_error" });
    return { row: null, exactFinalUrl, httpStatus: response.status, safeResponseBody, warningReason: "http_error" };
  }

  let body: unknown;
  try {
    body = JSON.parse(responseBody);
  } catch {
    logReferenceWarning(referenceKind, reference, context, exactFinalUrl, response.status,
      safeResponseBody, "invalid_json", expectedReferenceShape(referenceKind), { responseType: "invalid_json" });
    return { row: null, exactFinalUrl, httpStatus: response.status, safeResponseBody, warningReason: "invalid_json" };
  }

  if (!isHistoryReferenceRow(body, reference, referenceKind)) {
    logReferenceWarning(referenceKind, reference, context, exactFinalUrl, response.status,
      safeResponseBody, "invalid_shape", expectedReferenceShape(referenceKind), describeODataShape(body));
    return { row: null, exactFinalUrl, httpStatus: response.status, safeResponseBody, warningReason: "invalid_shape" };
  }

  console.info({
    event: "one_c_order_history_reference_lookup_succeeded",
    syncId: context.syncId,
    page: context.page,
    referenceKind,
    referenceRef: reference,
    exactFinalUrl,
    httpStatus: response.status,
    safeResponseBody,
    cacheHit: false,
    expectedResponseShape: expectedReferenceShape(referenceKind),
    actualResponseShape: describeODataShape(body),
    resolvedCode: typeof body.Code === "string" ? body.Code.trim() : null,
    resolvedDescription: typeof body.Description === "string" ? body.Description.trim() : null,
  });
  return { row: body, exactFinalUrl, httpStatus: response.status, safeResponseBody, warningReason: null };
}

function buildHistoryReferenceUrl(config: OneCProviderConfig, resource: string, reference: string): string {
  if (!isOneCGuid(reference)) throw new IntegrationValidationError("1C order reference is invalid.");
  const select = resource === ORDER_STATE_RESOURCE
    ? "Ref_Key,Description,DeletionMark"
    : "Ref_Key,Code,Description,DeletionMark";
  return `${requiredBaseUrl(config)}/${resource}(guid'${reference}')` +
    `?$select=${select}&$format=json`;
}

function isHistoryReferenceRow(
  value: unknown,
  reference: string,
  referenceKind: ReferenceKind,
): value is Record<string, unknown> {
  if (
    !isRecordValue(value) ||
    stringValue(value.Ref_Key).toLowerCase() !== reference.toLowerCase() ||
    value.DeletionMark === true
  ) {
    return false;
  }
  return referenceKind !== "state" || (
    typeof value.Description === "string" && value.Description.trim().length > 0
  );
}

function expectedReferenceShape(referenceKind: ReferenceKind): string {
  return referenceKind === "state"
    ? `${ORDER_STATE_TYPE} record with Ref_Key, Description, DeletionMark`
    : "StandardODATA.Catalog_Валюты record with Ref_Key, Code, Description, DeletionMark";
}

function normalizeStateDescription(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}

function logReferenceCacheHit(
  referenceKind: ReferenceKind,
  resource: string,
  reference: string,
  context: HistorySyncContext,
  config: OneCProviderConfig,
): void {
  console.info({
    event: "one_c_order_history_reference_cache_hit",
    syncId: context.syncId,
    page: context.page,
    referenceKind,
    referenceRef: reference,
    exactFinalUrl: buildHistoryReferenceUrl(config, resource, reference),
    cacheHit: true,
  });
}

function logReferenceWarning(
  referenceKind: ReferenceKind,
  reference: string,
  context: HistorySyncContext,
  exactFinalUrl: string,
  httpStatus: number | null,
  safeResponseBody: string | null,
  warningReason: string,
  expectedResponseShape: string,
  actualResponseShape: unknown,
): void {
  console.warn({
    event: "one_c_order_history_reference_lookup_warning",
    syncId: context.syncId,
    page: context.page,
    referenceKind,
    referenceRef: reference,
    exactFinalUrl,
    httpStatus,
    safeResponseBody,
    cacheHit: false,
    expectedResponseShape,
    actualResponseShape,
    resolvedCode: null,
    resolvedDescription: null,
    warningReason,
  });
}

function historyHttpError(status: number): Error {
  if (status === 401) return new IntegrationUnauthorizedError();
  if (status === 403) return new IntegrationForbiddenError();
  if (status >= 500) return new IntegrationProviderUnavailableError("1C order history is unavailable.");
  return new IntegrationHttpError();
}

function safeODataErrorBody(body: string): string {
  return body.trim().slice(0, 8000);
}

function safeErrorDiagnostic(error: unknown): { errorType: string; errorName: string | null; errorMessage: string | null } {
  return {
    errorType: error?.constructor?.name ?? typeof error,
    errorName: error instanceof Error ? error.name : null,
    errorMessage: error instanceof Error ? error.message : null,
  };
}

function describeODataShape(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { rootType: Array.isArray(value) ? "array" : typeof value, rootKeys: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    rootType: "object",
    rootKeys: Object.keys(record).slice(0, 20),
    valueType: Array.isArray(record.value) ? "array" : typeof record.value,
    valueLength: Array.isArray(record.value) ? record.value.length : null,
  };
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

function parseHistoryLimit(value: number | undefined): number {
  const limit = value ?? 100;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new IntegrationValidationError("1C order history page size is invalid.");
  }
  return Math.min(limit, 250);
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

async function fetchOneC(config: OneCProviderConfig, url: string | URL, message: string): Promise<Response> {
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
