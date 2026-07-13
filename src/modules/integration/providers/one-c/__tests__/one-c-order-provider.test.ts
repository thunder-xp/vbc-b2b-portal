import { afterEach, describe, expect, it, vi } from "vitest";

import type { SalesOrderDTO } from "../../../dto";
import { OneCProvider } from "../one-c-provider";
import { buildOneCCustomerOrderPayload } from "../one-c-order-provider";

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

afterEach(() => vi.unstubAllGlobals());

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
    expect(payload.Запасы[0]).toMatchObject({ Цена: 1314, Количество: 1, Сумма: 1314, Всего: 1314, СуммаНДС: 0, ТипНоменклатурыЗапас: true, Резерв: 0, РезервОтгрузка: 0 });
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

  it("posts JSON and returns the validated unposted 1C identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      Ref_Key: "77777777-7777-4777-8777-777777777777", Number: "NSUU-TEST", Date: "2026-07-13T20:17:30", Posted: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OneCProvider({ baseUrl: "https://erp.example/odata", username: "user", password: "secret", requestTimeoutMs: 10000 });

    const result = await provider.orders.exportSalesOrder(order);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(decodeURIComponent(url.toString())).toBe("https://erp.example/odata/Document_ЗаказПокупателя?$format=json");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ Posted: false, Автор_Key: "272a1ac4-0194-11eb-8975-000c29cf9dd4" });
    expect(result).toMatchObject({ orderNumber: "NSUU-TEST", status: "unposted", orderReference: { externalId: "77777777-7777-4777-8777-777777777777" } });
  });
});

function ref(externalId: string) { return { providerCode: "one-c", externalId, externalType: "test" }; }
