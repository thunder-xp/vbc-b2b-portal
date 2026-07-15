import { afterEach, describe, expect, it, vi } from "vitest";

import { OneCProvider } from "../one-c-provider";

const COUNTERPARTY = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";
const ORDER = "11111111-1111-1111-1111-111111111111";
const PRODUCT = "22222222-2222-2222-2222-222222222222";
const STATE = "33333333-3333-3333-3333-333333333333";
const CURRENCY = "44444444-4444-4444-4444-444444444444";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OneCCustomerOrderProvider history", () => {
  it.each([
    ["Открыт", "open"],
    ["Предзаказ", "preorder"],
    ["Тест", "test"],
    ["Завершен", "completed"],
  ] as const)("maps the proven 1C state description %s", async (description, expected) => {
    vi.stubGlobal("fetch", historyFetch(description));
    const result = await provider().orders.fetchSalesOrderHistory(request());
    expect(result.items[0]).toMatchObject({ stateRaw: STATE, stateCode: expected, currencyCode: "MDL" });
  });

  it("preserves an unknown raw state and emits a diagnostic instead of fabricating a status", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", historyFetch("Неизвестно"));
    const result = await provider().orders.fetchSalesOrderHistory(request());
    expect(result.items[0]).toMatchObject({ stateRaw: STATE, stateCode: null });
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ event: "one_c_order_state_unmapped", stateReference: STATE }));
  });

  it("uses the exact counterparty boundary and returns a continuation cursor", async () => {
    vi.stubGlobal("fetch", historyFetch("Открыт", 2));
    const result = await provider().orders.fetchSalesOrderHistory(request(2));
    const [url] = vi.mocked(fetch).mock.calls[0] as [URL];
    const decoded = decodeURIComponent(url.toString()).replaceAll("+", " ");
    expect(decoded).toContain(`$filter=Контрагент_Key eq guid'${COUNTERPARTY}'`);
    expect(decoded).toContain("$top=2");
    expect(decoded).toContain("$skip=0");
    expect(result.nextCursor).toBe("2");
  });

  it("keeps DeletionMark and Posted as independent 1C document state", async () => {
    vi.stubGlobal("fetch", historyFetch("Открыт", 1, { Posted: false, DeletionMark: true }));
    const result = await provider().orders.fetchSalesOrderHistory(request());
    expect(result.items[0]).toMatchObject({ posted: false, deletionMark: true, number: "NSUU-001" });
  });
});

function provider() {
  return new OneCProvider({ baseUrl: "https://erp.example/odata", username: "user", password: "secret", requestTimeoutMs: 10000 });
}

function request(limit = 100) {
  return {
    partnerCompanyReference: { providerCode: "one-c", externalId: COUNTERPARTY, externalType: "counterparty" },
    page: { limit, cursor: null },
  };
}

function historyFetch(description: string, rowCount = 1, override: Record<string, unknown> = {}) {
  return vi.fn((input: string | URL | Request) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("Catalog_СостоянияЗаказовПокупателей")) return Promise.resolve(json({ Ref_Key: STATE, Code: "", Description: description, DeletionMark: false }));
    if (url.includes("Catalog_Валюты")) return Promise.resolve(json({ Ref_Key: CURRENCY, Code: "498", Description: "MDL", DeletionMark: false }));
    return Promise.resolve(json({ value: Array.from({ length: rowCount }, (_, index) => historyRow({ Ref_Key: index ? `11111111-1111-1111-1111-${String(index).padStart(12, "0")}` : ORDER, ...override })) }));
  });
}

function historyRow(override: Record<string, unknown> = {}) {
  return {
    Ref_Key: ORDER,
    Number: "NSUU-001",
    Date: "2026-07-15T10:00:00",
    Posted: true,
    DeletionMark: false,
    Контрагент_Key: COUNTERPARTY,
    Договор_Key: "55555555-5555-5555-5555-555555555555",
    ДатаОтгрузки: "2026-07-16T00:00:00",
    СуммаДокумента: 1000,
    ВалютаДокумента_Key: CURRENCY,
    СостояниеЗаказа: STATE,
    СостояниеЗаказа_Type: "StandardODATA.Catalog_СостоянияЗаказовПокупателей",
    DataVersion: "v1",
    Запасы: [{ LineNumber: "1", Номенклатура: PRODUCT, Характеристика_Key: "00000000-0000-0000-0000-000000000000", Количество: 2, Цена: 500, Всего: 1000 }],
    ...override,
  };
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}
