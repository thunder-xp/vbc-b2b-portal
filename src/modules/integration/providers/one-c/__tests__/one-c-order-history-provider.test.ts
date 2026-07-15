import { afterEach, describe, expect, it, vi } from "vitest";

import { OneCProvider } from "../one-c-provider";

const COUNTERPARTY = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";
const ORDER = "11111111-1111-1111-1111-111111111111";
const PRODUCT = "22222222-2222-2222-2222-222222222222";
const STATE = "585a9990-314b-11e9-a7dc-94de80db60f1";
const CURRENCY = "cf53f667-77a3-4c69-8146-2fd58525bbfc";

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
    expect(result.items[0]).toMatchObject({
      stateReference: { externalId: STATE },
      stateRaw: description,
      stateCode: expected,
      currencyCode: "MDL",
    });
  });

  it("normalizes state description whitespace and case", async () => {
    vi.stubGlobal("fetch", historyFetch("  оТкРыТ  "));
    const result = await provider().orders.fetchSalesOrderHistory(request());
    expect(result.items[0]).toMatchObject({ stateRaw: "оТкРыТ", stateCode: "open" });
  });

  it("preserves an unknown raw state and emits a diagnostic instead of fabricating a status", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", historyFetch("Неизвестно"));
    const result = await provider().orders.fetchSalesOrderHistory(request());
    expect(result.items[0]).toMatchObject({ stateReference: { externalId: STATE }, stateRaw: "Неизвестно", stateCode: "unknown" });
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ event: "one_c_order_state_unmapped", stateReference: STATE }));
  });

  it("uses the exact counterparty boundary and returns a continuation cursor", async () => {
    vi.stubGlobal("fetch", historyFetch("Открыт", 2));
    const result = await provider().orders.fetchSalesOrderHistory(request(2));
    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(typeof url).toBe("string");
    expect(url).toContain(`$filter=Контрагент_Key eq guid'${COUNTERPARTY}'`);
    expect(url).toContain("$top=2");
    expect(url).toContain("$skip=0");
    expect(url).not.toContain("%24filter");
    expect(url).not.toContain("+eq+");
    expect(url).not.toContain("guid%27");
    expect(url).not.toContain("$orderby");
    expect(url).not.toContain("Запасы");
    expect(result.nextCursor).toBe("2");
  });

  it("keeps the literal 1C-compatible query shape on page two", async () => {
    vi.stubGlobal("fetch", historyFetch("Открыт", 1));
    await provider().orders.fetchSalesOrderHistory({
      ...request(),
      page: { limit: 100, cursor: "100" },
    });
    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(url).toContain(`?$filter=Контрагент_Key eq guid'${COUNTERPARTY}'`);
    expect(url).toContain("&$top=100&$skip=100&$format=json");
    expect(url).not.toContain("%24filter");
  });

  it("loads order lines separately after the scalar header page", async () => {
    vi.stubGlobal("fetch", historyFetch("Открыт", 2));
    const result = await provider().orders.fetchSalesOrderHistory(request(2));
    const decodedCalls = vi.mocked(fetch).mock.calls.map(([input]) => decodeURIComponent(String(input)));
    expect(decodedCalls.filter((url) => url.includes("Document_ЗаказПокупателя(guid'"))).toHaveLength(2);
    expect(result.lineRowCount).toBe(2);
    expect(result.items.every((item) => item.items.length === 1)).toBe(true);
  });

  it("resolves repeated state and currency references once per run", async () => {
    const fetchMock = historyFetch("Открыт", 2);
    vi.stubGlobal("fetch", fetchMock);
    await provider().orders.fetchSalesOrderHistory(request(2));
    const calls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(calls.filter((url) => url.includes("Catalog_СостоянияЗаказовПокупателей"))).toHaveLength(1);
    expect(calls.filter((url) => url.includes("Catalog_Валюты"))).toHaveLength(1);
    expect(calls).toContain(`https://erp.example/odata/Catalog_СостоянияЗаказовПокупателей(guid'${STATE}')?$select=Ref_Key,Description,DeletionMark&$format=json`);
    expect(calls).toContain(`https://erp.example/odata/Catalog_Валюты(guid'${CURRENCY}')?$select=Ref_Key,Code,Description,DeletionMark&$format=json`);
  });

  it("reuses resolved references across pages", async () => {
    const fetchMock = historyFetch("Открыт", 1);
    vi.stubGlobal("fetch", fetchMock);
    const orders = provider().orders;
    await orders.fetchSalesOrderHistory(request(1));
    await orders.fetchSalesOrderHistory({ ...request(1), page: { limit: 1, cursor: "1" } });
    const calls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(calls.filter((url) => url.includes("Catalog_СостоянияЗаказовПокупателей"))).toHaveLength(1);
    expect(calls.filter((url) => url.includes("Catalog_Валюты"))).toHaveLength(1);
  });

  it("degrades a failed state lookup to unknown and still loads lines", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = historyFetchWithReferenceFailure("state", 404, { error: "state unavailable" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider().orders.fetchSalesOrderHistory(request());
    expect(result.items[0]).toMatchObject({ stateReference: { externalId: STATE }, stateRaw: null, stateCode: "unknown", currencyCode: "MDL" });
    expect(result.lineRowCount).toBe(1);
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({
      event: "one_c_order_history_reference_lookup_warning",
      referenceKind: "state",
      referenceRef: STATE,
      httpStatus: 404,
      safeResponseBody: JSON.stringify({ error: "state unavailable" }),
      warningReason: "http_error",
    }));
  });

  it.each([
    ["a mismatched reference", { Ref_Key: ORDER, Description: "Открыт", DeletionMark: false }],
    ["a deleted state", { Ref_Key: STATE, Description: "Открыт", DeletionMark: true }],
    ["an empty description", { Ref_Key: STATE, Description: "  ", DeletionMark: false }],
  ])("degrades %s to unknown", async (_case, stateRow) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", historyFetchWithStateRow(stateRow));
    const result = await provider().orders.fetchSalesOrderHistory(request());
    expect(result.items[0]).toMatchObject({
      stateReference: { externalId: STATE },
      stateRaw: null,
      stateCode: "unknown",
    });
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({
      event: "one_c_order_history_reference_lookup_warning",
      warningReason: "invalid_shape",
    }));
  });

  it("degrades a failed currency lookup without aborting or erasing a cached value", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = historyFetchWithReferenceFailure("currency", 500, { error: "currency unavailable" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider().orders.fetchSalesOrderHistory(request());
    expect(result.items[0]).toMatchObject({ stateCode: "open", currencyCode: null });
    expect(result.lineRowCount).toBe(1);
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({
      event: "one_c_order_history_reference_lookup_warning",
      referenceKind: "currency",
      referenceRef: CURRENCY,
      httpStatus: 500,
    }));

    vi.clearAllMocks();
    const successfulFetch = historyFetch("Открыт", 1);
    vi.stubGlobal("fetch", successfulFetch);
    const orders = provider().orders;
    const first = await orders.fetchSalesOrderHistory(request());
    const second = await orders.fetchSalesOrderHistory({ ...request(), page: { limit: 100, cursor: "100" } });
    expect(first.items[0]?.currencyCode).toBe("MDL");
    expect(second.items[0]?.currencyCode).toBe("MDL");
    expect(successfulFetch.mock.calls.map(([input]) => String(input)).filter((url) => url.includes("Catalog_Валюты"))).toHaveLength(1);
  });

  it("completes enrichment before starting direct line reads", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchMock = historyFetch("Открыт", 1);
    vi.stubGlobal("fetch", fetchMock);
    await provider().orders.fetchSalesOrderHistory(request());
    const calls = fetchMock.mock.calls.map(([input]) => decodeURIComponent(String(input)));
    const stateIndex = calls.findIndex((url) => url.includes("Catalog_СостоянияЗаказовПокупателей"));
    const currencyIndex = calls.findIndex((url) => url.includes("Catalog_Валюты"));
    const lineIndex = calls.findIndex((url) => url.includes("Document_ЗаказПокупателя(guid'"));
    expect(stateIndex).toBeGreaterThan(0);
    expect(currencyIndex).toBeGreaterThan(0);
    expect(lineIndex).toBeGreaterThan(stateIndex);
    expect(lineIndex).toBeGreaterThan(currencyIndex);
  });

  it("keeps malformed core document identity fatal", async () => {
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (!url.includes("(guid'")) return Promise.resolve(json({ value: [historyRow({ Ref_Key: "invalid" })] }));
      return Promise.resolve(json({}));
    }));
    await expect(provider().orders.fetchSalesOrderHistory(request())).rejects.toThrow("row 0 is invalid");
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
    if (url.includes("Catalog_СостоянияЗаказовПокупателей")) return Promise.resolve(json({ Ref_Key: STATE, Description: description, DeletionMark: false }));
    if (url.includes("Catalog_Валюты")) return Promise.resolve(json({ Ref_Key: CURRENCY, Code: "498", Description: "MDL", DeletionMark: false }));
    if (url.includes("Document_ЗаказПокупателя(guid'")) {
      const reference = /guid'([^']+)'/.exec(url)?.[1] ?? ORDER;
      return Promise.resolve(json({ Ref_Key: reference, Запасы: [historyLine()] }));
    }
    return Promise.resolve(json({ value: Array.from({ length: rowCount }, (_, index) => historyRow({ Ref_Key: index ? `11111111-1111-1111-1111-${String(index).padStart(12, "0")}` : ORDER, ...override })) }));
  });
}

function historyFetchWithReferenceFailure(
  kind: "state" | "currency",
  status: number,
  body: Record<string, unknown>,
) {
  const fallback = historyFetch("Открыт");
  return vi.fn((input: string | URL | Request) => {
    const url = String(input);
    const fails = kind === "state"
      ? url.includes("Catalog_СостоянияЗаказовПокупателей")
      : url.includes("Catalog_Валюты");
    return fails ? Promise.resolve(json(body, status)) : fallback(input);
  });
}

function historyFetchWithStateRow(stateRow: Record<string, unknown>) {
  const fallback = historyFetch("Открыт");
  return vi.fn((input: string | URL | Request) => {
    const url = String(input);
    return url.includes("Catalog_СостоянияЗаказовПокупателей")
      ? Promise.resolve(json(stateRow))
      : fallback(input);
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
    ...override,
  };
}

function historyLine() {
  return { LineNumber: "1", Номенклатура: PRODUCT, Характеристика_Key: "00000000-0000-0000-0000-000000000000", Количество: 2, Цена: 500, Всего: 1000 };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
