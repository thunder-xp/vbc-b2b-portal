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

export type OneCCustomerOrderPayload = ReturnType<typeof buildOneCCustomerOrderPayload>;

export class OneCCustomerOrderProvider implements OrderProvider {
  constructor(private readonly config: OneCProviderConfig) {}

  async exportSalesOrder(order: SalesOrderDTO): Promise<SalesOrderExportResultDTO> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) {
      throw new IntegrationProviderUnavailableError("1C order export is not configured.");
    }
    const url = new URL(`${baseUrl.replace(/\/$/, "")}/${CUSTOMER_ORDER_RESOURCE}`);
    url.searchParams.set("$format", "json");

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
        },
        body: JSON.stringify(buildOneCCustomerOrderPayload(order)),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new IntegrationTimeoutError("1C customer order creation timed out.");
      }
      throw new IntegrationProviderUnavailableError("1C customer order creation is unavailable.");
    }

    if (response.status === 401) throw new IntegrationUnauthorizedError();
    if (response.status === 403) throw new IntegrationForbiddenError();
    if (!response.ok) throw new IntegrationHttpError();

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new IntegrationValidationError("1C returned an invalid customer order response.");
    }
    if (!isCreatedOrderResponse(value) || value.Posted === true) {
      throw new IntegrationValidationError("1C returned an invalid customer order response.");
    }

    return {
      orderReference: { providerCode: "one-c", externalId: value.Ref_Key, externalType: CUSTOMER_ORDER_TYPE },
      orderNumber: value.Number,
      documentDate: new Date(value.Date).toISOString(),
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
