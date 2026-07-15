import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPartnerOrderHistoryProvider } from "../service-factory";

const COUNTERPARTY = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";
const ORDER = "11111111-1111-1111-1111-111111111111";
const PRODUCT = "22222222-2222-2222-2222-222222222222";
const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("production order-history runtime wiring", () => {
  it("resolves the scalar-header provider and separate line reader used by the action factory", async () => {
    vi.stubEnv("ONEC_BASE_URL", "https://erp.example/odata");
    vi.stubEnv("ONEC_USERNAME", "user");
    vi.stubEnv("ONEC_PASSWORD", "secret");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "test-commit");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = decodeURIComponent(String(input));
      if (url.includes(`Document_ЗаказПокупателя(guid'${ORDER}')`)) {
        return json({ Ref_Key: ORDER, Запасы: [{ LineNumber: "1", Номенклатура: PRODUCT, Характеристика_Key: ZERO_GUID, Количество: 1, Цена: 10, Всего: 10 }] });
      }
      return json({ value: [{
        Ref_Key: ORDER,
        Number: "NSUU-001",
        Date: "2026-07-15T10:00:00",
        Posted: false,
        DeletionMark: false,
        Контрагент_Key: COUNTERPARTY,
        Договор_Key: ZERO_GUID,
        ДатаОтгрузки: "2026-07-16T00:00:00",
        СуммаДокумента: 10,
        ВалютаДокумента_Key: ZERO_GUID,
        СостояниеЗаказа: ZERO_GUID,
        СостояниеЗаказа_Type: "StandardODATA.Catalog_СостоянияЗаказовПокупателей",
        DataVersion: "v1",
      }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createPartnerOrderHistoryProvider();
    await provider.fetchSalesOrderHistory({
      partnerCompanyReference: { providerCode: "one-c", externalId: COUNTERPARTY, externalType: "counterparty" },
      page: { limit: 100, cursor: null },
    });

    expect(provider.constructor.name).toBe("OneCCustomerOrderProvider");
    const rawUrls = fetchMock.mock.calls.map(([input]) => String(input));
    const headerUrl = rawUrls.find((url) => !url.includes("(guid'"));
    const lineUrl = rawUrls.find((url) => url.includes(`(guid'${ORDER}')`));
    expect(headerUrl).toContain(`$filter=Контрагент_Key eq guid'${COUNTERPARTY}'`);
    expect(headerUrl).toContain("&$top=100&$skip=0&$format=json");
    expect(headerUrl).not.toContain("%24filter");
    expect(headerUrl).not.toContain("+eq+");
    expect(headerUrl).not.toContain("guid%27");
    expect(headerUrl).not.toContain("$orderby");
    expect(headerUrl).not.toContain("Запасы");
    expect(decodeURIComponent(lineUrl ?? "")).toContain("$select=Ref_Key,Запасы");
    expect(info).toHaveBeenCalledWith(expect.objectContaining({
      event: "one_c_order_history_request",
      deployedCommitSha: "test-commit",
      historyProviderImplementation: "OneCCustomerOrderProvider",
      historyQueryMode: "scalar_headers_without_orderby",
      queryBuilderMode: "literal_1c_compatible",
      urlSearchParamsUsed: false,
      filterLiteralPreserved: true,
      headerIncludesInventoryLines: false,
      orderByApplied: false,
    }));
  });
});

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}
