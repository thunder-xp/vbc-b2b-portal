import type { OrderProvider, SalesOrderStatusFetchRequestDTO } from "../../contracts";
import type { IntegrationPageResultDTO, SalesOrderDTO, SalesOrderExportResultDTO } from "../../dto";
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
    };
  }

  async fetchSalesOrders(
    _input: SalesOrderStatusFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<SalesOrderDTO>> {
    throw new IntegrationValidationError("1C customer order import is not implemented.");
  }
}

async function readBackCreatedOrder(
  config: OneCProviderConfig,
  order: SalesOrderDTO,
  externalId: string,
): Promise<CreatedOrderResponse> {
  const url = new URL(
    `${config.baseUrl!.replace(/\/$/, "")}/${CUSTOMER_ORDER_RESOURCE}(guid'${externalId}')`,
  );
  url.searchParams.set(
    "$select",
    "Ref_Key,Number,Date,Posted,Контрагент_Key,Договор_Key,Запасы",
  );
  url.searchParams.set("$format", "json");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`, "utf8").toString("base64")}`,
      },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch {
    throw new IntegrationProviderUnavailableError(
      "1C customer order read-back is unavailable.",
    );
  }

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
  Posted?: boolean;
  Контрагент_Key?: string;
  Договор_Key?: string;
  Запасы?: unknown[];
};

function isVerifiedOrderReadBack(
  value: unknown,
  order: SalesOrderDTO,
  externalId: string,
): value is CreatedOrderResponse {
  if (!isCreatedOrderResponse(value) || value.Posted === true) return false;
  const row = value as CreatedOrderResponse;
  if (
    row.Ref_Key.toLowerCase() !== externalId.toLowerCase() ||
    row.Контрагент_Key?.toLowerCase() !== order.partnerCompanyReference.externalId.toLowerCase() ||
    row.Договор_Key?.toLowerCase() !== order.contractReference.externalId.toLowerCase() ||
    !Array.isArray(row.Запасы) ||
    row.Запасы.length !== order.items.length
  ) {
    return false;
  }

  return order.items.every((expected, index) => {
    const item = row.Запасы?.[index];
    if (!item || typeof item !== "object") return false;
    const actual = item as Record<string, unknown>;
    return actual.Номенклатура === expected.productReference.externalId &&
      Number(actual.Количество) === expected.quantity &&
      Number(actual.Цена) === expected.price?.amount;
  });
}
