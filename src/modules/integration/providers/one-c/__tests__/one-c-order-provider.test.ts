import { afterEach, describe, expect, it, vi } from "vitest";

import type { SalesOrderDTO } from "../../../dto";
import { IntegrationHttpError, IntegrationProviderUnavailableError } from "../../../errors";
import { OneCProvider } from "../one-c-provider";
import {
  buildLegacyMinimalOneCCustomerOrderPayload,
  buildOneCCustomerOrderPayload,
} from "../one-c-order-provider";

const order: SalesOrderDTO = {
  reference: null,
  partnerCompanyReference: ref("11111111-1111-4111-8111-111111111111"),
  contractReference: ref("22222222-2222-4222-8222-222222222222"),
  authorReference: ref("272a1ac4-0194-11eb-8975-000c29cf9dd4"),
  organizationReference: ref("4643d461-aa49-4b70-9486-a59f80ee6af8"),
  priceTypeReference: ref("33333333-3333-4333-8333-333333333333"),
  currencyReference: ref("44444444-4444-4444-8444-444444444444"),
  orderStateReference: ref("acf7b2a1-1a78-11e5-8b0f-00155d010501"),
  salesStructuralUnitReference: ref("6d5affb3-94b3-4377-a8c2-8d07f0450d95"),
  reservationStructuralUnitReference: ref("86197770-0aac-431a-aad6-8e7099029bbb"),
  portalOrderReference: "55555555-5555-4555-8555-555555555555",
  status: "draft", currency: "USD", requestedDeliveryDate: "2099-01-10", documentTotal: 1314,
  items: [{
    productReference: ref("66666666-6666-4666-8666-666666666666"), sku: "SKU-1", name: "Camera",
    quantity: 1, unitCode: null, price: { amount: 1314, currency: "USD" },
    characteristicReference: ref("00000000-0000-0000-0000-000000000000"),
    unitReference: ref("a4f770f7-5a4e-435f-a55f-28cb995d36c9"),
    vatRateReference: ref("acf7b292-1a78-11e5-8b0f-00155d010501"), lineTotal: 1314,
  }],
  comment: "Portal test", metadata: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OneCCustomerOrderProvider", () => {
  it("builds only the explicit unposted customer-order payload", () => {
    const payload = buildOneCCustomerOrderPayload(order);
    expect(Object.keys(payload).sort()).toEqual([
      "Автор_Key", "ВалютаДокумента_Key", "ВидОперации", "ВидЦен_Key", "ДатаОтгрузки", "Договор_Key",
      "Комментарий", "Контрагент_Key", "Кратность", "Курс", "НДСВключатьВСтоимость", "НалогообложениеНДС",
      "Организация_Key", "Posted", "СпособДоставки", "СтруктурнаяЕдиницаРезерв_Key", "СтруктурнаяЕдиницаПродажи_Key",
      "СуммаВключаетНДС", "СуммаДокумента", "СостояниеЗаказа", "ТипДенежныхСредств", "УчитыватьВНУ", "Запасы", "Date",
    ].sort());
    expect(payload).toMatchObject({ Posted: false, Автор_Key: "272a1ac4-0194-11eb-8975-000c29cf9dd4", ДатаОтгрузки: "2099-01-10", СуммаДокумента: 1314 });
    expect(payload).not.toHaveProperty("Ref_Key");
    expect(payload).not.toHaveProperty("Number");
    expect(payload.Запасы[0]).toMatchObject({ Цена: 1314, Количество: 1, Сумма: 1314, Всего: 1314, СуммаНДС: 0, ДатаОтгрузки: "2099-01-10", ТипНоменклатурыЗапас: true, Резерв: 0, РезервОтгрузка: 0 });
    expect(payload).not.toHaveProperty("КалендарьОплаты");
    expect(payload).not.toHaveProperty("ДатаОплаты");
    expect(Object.keys(payload.Запасы[0]!).sort()).toEqual([
      "ДатаОтгрузки", "ЕдиницаИзмерения", "ЕдиницаИзмерения_Type", "Количество", "КлючСвязи", "Номенклатура",
      "Номенклатура_Type", "Резерв", "РезервОтгрузка", "СтавкаНДС_Key", "СтруктурнаяЕдиницаРезерв_Key",
      "Сумма", "СуммаНДС", "ТипНоменклатурыЗапас", "Всего", "Характеристика_Key", "Цена",
    ].sort());
    expect(payload).not.toHaveProperty("Товары");
    expect(payload).not.toHaveProperty("ДоговорКонтрагента_Key");
    expect(payload).not.toHaveProperty("СостояниеЗаказа_Key");
    expect(payload).not.toHaveProperty("СтруктурнаяЕдиница_Key");
    expect(payload).not.toHaveProperty("ХозяйственнаяОперация");
    expect(payload).not.toHaveProperty("ВидОплаты");
  });

  it("builds the legacy-minimal allowlisted payload with full 1C datetimes", () => {
    const payload = buildLegacyMinimalOneCCustomerOrderPayload(
      order,
      new Date("2026-07-14T12:34:56.000Z"),
    );

    expect(payload).toEqual({
      Date: "2026-07-14T12:34:56",
      ДатаОтгрузки: "2099-01-10T00:00:00",
      Контрагент_Key: "11111111-1111-4111-8111-111111111111",
      Договор_Key: "22222222-2222-4222-8222-222222222222",
      Кратность: 1,
      СуммаДокумента: 1314,
      СпособДоставки: "Самовывоз",
      Комментарий: "Portal test",
      Запасы: [{
        СтавкаНДС_Key: "acf7b292-1a78-11e5-8b0f-00155d010501",
        LineNumber: 1,
        ТипНоменклатурыЗапас: true,
        Номенклатура: "66666666-6666-4666-8666-666666666666",
        Номенклатура_Type: "StandardODATA.Catalog_Номенклатура",
        Характеристика_Key: "00000000-0000-0000-0000-000000000000",
        ЕдиницаИзмерения: "a4f770f7-5a4e-435f-a55f-28cb995d36c9",
        ЕдиницаИзмерения_Type: "StandardODATA.Catalog_КлассификаторЕдиницИзмерения",
        Цена: 1314,
        Сумма: 1314,
        Количество: 1,
        Всего: 1314,
      }],
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /Posted|Автор_Key|Организация_Key|ВидЦен_Key|ВалютаДокумента_Key|СостояниеЗаказа|Резерв|СуммаНДС|ПлатежныйКалендарь/,
    );
  });

  it("keeps legacy line sum equal to unit price while total reflects quantity", () => {
    const payload = buildLegacyMinimalOneCCustomerOrderPayload({
      ...order,
      documentTotal: 2628,
      items: [{ ...order.items[0]!, quantity: 2, lineTotal: 2628 }],
    });

    expect(payload.Запасы[0]).toMatchObject({
      Цена: 1314,
      Сумма: 1314,
      Количество: 2,
      Всего: 2628,
    });
  });

  it("uses the legacy-minimal payload only when explicitly enabled", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      Ref_Key: "77777777-7777-4777-8777-777777777777",
      Number: "NSUU-TEST",
      Date: "2026-07-13T20:17:30",
      Posted: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(readBackResponse());
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OneCProvider({
      baseUrl: "https://erp.example/odata",
      username: "user",
      password: "secret",
      requestTimeoutMs: 10000,
      useLegacyMinimalOrderPayload: true,
    });

    await provider.orders.exportSalesOrder(order);

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("Posted");
    expect(payload).not.toHaveProperty("Автор_Key");
    expect(payload).toMatchObject({ Запасы: [expect.objectContaining({ LineNumber: 1 })] });
  });

  it("posts JSON and returns the validated unposted 1C identity", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      Ref_Key: "77777777-7777-4777-8777-777777777777", Number: "NSUU-TEST", Date: "2026-07-13T20:17:30", Posted: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(readBackResponse());
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OneCProvider({ baseUrl: "https://erp.example/odata", username: "user", password: "secret", requestTimeoutMs: 10000 });

    const result = await provider.orders.exportSalesOrder(order);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(decodeURIComponent(url.toString())).toBe("https://erp.example/odata/Document_ЗаказПокупателя?$format=json");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ Posted: false, Автор_Key: "272a1ac4-0194-11eb-8975-000c29cf9dd4" });
    expect(result).toMatchObject({ orderNumber: "NSUU-TEST", status: "unposted", orderReference: { externalId: "77777777-7777-4777-8777-777777777777" } });
  });

  it("does not report success when the created order cannot be verified by read-back", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        Ref_Key: "77777777-7777-4777-8777-777777777777",
        Number: "NSUU-TEST",
        Date: "2026-07-13T20:17:30",
        Posted: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("not found", { status: 404 })));
    const provider = new OneCProvider({
      baseUrl: "https://erp.example/odata",
      username: "user",
      password: "secret",
      requestTimeoutMs: 10000,
      useLegacyMinimalOrderPayload: true,
    });

    await expect(provider.orders.exportSalesOrder(order))
      .rejects.toBeInstanceOf(IntegrationProviderUnavailableError);
  });

  it.each([
    { ДатаОтгрузки: "2099-01-11T00:00:00" },
    { СуммаДокумента: 1315 },
    { Posted: true },
  ])("blocks completion when read-back differs from the submitted order: %o", async (override) => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        Ref_Key: "77777777-7777-4777-8777-777777777777",
        Number: "NSUU-TEST",
        Date: "2026-07-13T20:17:30",
        Posted: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(readBackResponse(override)));
    const provider = new OneCProvider({ baseUrl: "https://erp.example/odata", username: "user", password: "secret", requestTimeoutMs: 10000 });

    await expect(provider.orders.exportSalesOrder(order))
      .rejects.toBeInstanceOf(IntegrationProviderUnavailableError);
  });

  it("finds one verified order by the exact submission token without posting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      value: [readBackRow({ Комментарий: `Создан порталом ${order.portalOrderReference}` })],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const provider = new OneCProvider({ baseUrl: "https://erp.example/odata", username: "user", password: "secret", requestTimeoutMs: 10000 });

    const result = await provider.orders.findExportedSalesOrders(order);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ orderNumber: "NSUU-TEST", documentTotal: 1314, itemCount: 1, totalUnits: 1 });
    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit | undefined];
    expect(init?.method).not.toBe("POST");
    expect(decodeURIComponent(url.toString()).replaceAll("+", " ")).toContain(`substringof('${order.portalOrderReference}',Комментарий) eq true`);
  });

  it("logs the exact safe HTTP status and response body before rejecting the request", async () => {
    const responseBody = JSON.stringify({ "odata.error": { code: "-1", message: { value: "Invalid field" } } });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(responseBody, {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })));
    const provider = new OneCProvider({ baseUrl: "https://erp.example/odata", username: "user", password: "secret", requestTimeoutMs: 10000 });

    await expect(provider.orders.exportSalesOrder(order)).rejects.toBeInstanceOf(IntegrationHttpError);

    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({
      event: "one_c_customer_order_response",
      stage: "one_c_http_response",
      httpStatus: 400,
      responseBody,
    }));
    expect(infoLog).toHaveBeenCalledWith(expect.objectContaining({
      event: "one_c_customer_order_request",
      stage: "one_c_http_request",
      payload: expect.objectContaining({ Posted: false, Запасы: expect.any(Array) }),
    }));
    expect(JSON.stringify(infoLog.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("Authorization");
  });
});

function ref(externalId: string) { return { providerCode: "one-c", externalId, externalType: "test" }; }

function readBackRow(overrides: Record<string, unknown> = {}) {
  return {
    Ref_Key: "77777777-7777-4777-8777-777777777777",
    Number: "NSUU-TEST",
    Date: "2026-07-13T20:17:30",
    Posted: false,
    Контрагент_Key: order.partnerCompanyReference.externalId,
    Договор_Key: order.contractReference.externalId,
    ДатаОтгрузки: "2099-01-10T00:00:00",
    СуммаДокумента: order.documentTotal,
    Комментарий: order.comment,
    Запасы: order.items.map((item) => ({
      Номенклатура: item.productReference.externalId,
      Количество: item.quantity,
      Цена: item.price?.amount,
    })),
    ...overrides,
  };
}

function readBackResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify(readBackRow(overrides)), { status: 200, headers: { "Content-Type": "application/json" } });
}
