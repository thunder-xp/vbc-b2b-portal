import { afterEach, describe, expect, it, vi } from "vitest";

import { OneCProvider } from "../one-c-provider";

const ORDER = "11111111-1111-4111-8111-111111111111";
const BUYER = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "33333333-3333-4333-8333-333333333333";
const STATE = "44444444-4444-4444-8444-444444444444";
const CURRENCY = "55555555-5555-4555-8555-555555555555";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OneC global order-history feeds", () => {
  it("reads counterparties globally with bounded deterministic paging", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ value: [{
      Ref_Key: BUYER,
      DeletionMark: false,
      ВидКонтрагента: "ЮридическоеЛицо",
      ВидГосударственногоОргана: "",
    }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().orders.fetchGlobalOrderHistoryCounterparties!({
      page: { limit: 1000, cursor: "0" },
    });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(decodeURIComponent(url.pathname)).toContain("Catalog_Контрагенты");
    expect(url.searchParams.get("$orderby")).toBe("Ref_Key asc");
    expect(url.searchParams.get("$top")).toBe("1000");
    expect(url.searchParams.get("$skip")).toBe("0");
    expect(url.searchParams.has("$filter")).toBe(false);
    expect(result.items[0]).toMatchObject({
      reference: { externalId: BUYER },
      counterpartyTypeCode: "ЮридическоеЛицо",
    });
    expect(result.nextCursor).toBeNull();
  });

  it("reads global scalar headers without per-counterparty or per-order requests", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("Catalog_СостоянияЗаказовПокупателей")) {
        return Promise.resolve(json({ Ref_Key: STATE, Description: "Завершен", DeletionMark: false }));
      }
      if (url.includes("Catalog_Валюты")) {
        return Promise.resolve(json({ Ref_Key: CURRENCY, Code: "498", Description: "MDL", DeletionMark: false }));
      }
      return Promise.resolve(json({ value: [header()] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().orders.fetchGlobalSalesOrderHistoryHeaders!({
      page: { limit: 1000, cursor: "0" },
    });

    const urls = fetchMock.mock.calls.map(([input]) => decodeURIComponent(String(input)));
    const headerUrl = new URL(urls.find((url) => url.includes("Document_ЗаказПокупателя?"))!);
    expect(headerUrl.searchParams.get("$orderby")).toBe("Date asc,Ref_Key asc");
    expect(headerUrl.searchParams.get("$select")).toContain("ВидОперации");
    expect(headerUrl.searchParams.has("$filter")).toBe(false);
    expect(urls.some((url) => url.includes("Document_ЗаказПокупателя(guid'"))).toBe(false);
    expect(result.items[0]).toMatchObject({
      reference: { externalId: ORDER },
      partnerCompanyReference: { externalId: BUYER },
      stateCode: "completed",
      sourceOperationCode: "ЗаказНаПродажу",
      items: [],
    });
  });

  it("reads all item rows from the global tabular-section entity in one page request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ value: [{
      Ref_Key: ORDER,
      LineNumber: 1,
      Номенклатура: PRODUCT,
      Характеристика_Key: "00000000-0000-0000-0000-000000000000",
      Количество: 2,
      Цена: 50,
      Сумма: 100,
      Всего: 100,
    }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().orders.fetchGlobalSalesOrderHistoryItems!({
      page: { limit: 1000, cursor: "0" },
    });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(url.pathname)).toContain("Document_ЗаказПокупателя_Запасы");
    expect(url.searchParams.get("$orderby")).toBe("Ref_Key asc,LineNumber asc");
    expect(url.searchParams.has("$filter")).toBe(false);
    expect(decodeURIComponent(url.pathname)).not.toContain("(guid'");
    expect(result.items[0]).toMatchObject({
      orderReference: { externalId: ORDER },
      productReference: { externalId: PRODUCT },
      lineNumber: 1,
    });
  });

  it("follows a governed continuation URL and rejects a foreign origin", async () => {
    const continuation = "https://erp.example/odata/Catalog_Контрагенты?$skiptoken=next";
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ value: [], "@odata.nextLink": continuation }))
      .mockResolvedValueOnce(json({ value: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const orders = provider().orders;
    const first = await orders.fetchGlobalOrderHistoryCounterparties!({ page: { limit: 1000, cursor: "0" } });
    expect(first.nextCursor).toBe(continuation);
    await orders.fetchGlobalOrderHistoryCounterparties!({ page: { limit: 1000, cursor: continuation } });
    const followed = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(decodeURIComponent(followed.pathname)).toBe("/odata/Catalog_Контрагенты");
    expect(followed.searchParams.get("$skiptoken")).toBe("next");
    await expect(orders.fetchGlobalOrderHistoryCounterparties!({
      page: { limit: 1000, cursor: "https://attacker.example/odata/Catalog_Контрагенты?$skip=1" },
    })).rejects.toThrow("outside the governed resource");
  });
});

function provider() {
  return new OneCProvider({
    baseUrl: "https://erp.example/odata",
    username: "user",
    password: "secret",
    requestTimeoutMs: 10000,
  });
}

function header() {
  return {
    Ref_Key: ORDER,
    Number: "NSUU-001",
    Date: "2018-06-01T10:00:00",
    Posted: true,
    DeletionMark: false,
    Контрагент_Key: BUYER,
    Договор_Key: "66666666-6666-4666-8666-666666666666",
    СостояниеЗаказа: STATE,
    ДатаОтгрузки: "2018-06-02T00:00:00",
    СуммаДокумента: 100,
    ВалютаДокумента_Key: CURRENCY,
    DataVersion: "v1",
    ВидОперации: "ЗаказНаПродажу",
  };
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
