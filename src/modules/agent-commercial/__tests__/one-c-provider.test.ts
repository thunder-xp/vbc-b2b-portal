import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OneCAgentCommercialProvider } from "../one-c-provider";

const ORDER = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION = "33333333-3333-4333-8333-333333333333";
const CURRENCY = "44444444-4444-4444-8444-444444444444";
const PRODUCT = "55555555-5555-4555-8555-555555555555";

describe("OneCAgentCommercialProvider", () => {
  beforeEach(() => {
    vi.stubEnv("ONEC_BASE_URL", "https://erp.example/odata");
    vi.stubEnv("ONEC_USERNAME", "user");
    vi.stubEnv("ONEC_PASSWORD", "secret");
    vi.stubEnv("ONEC_USE_MOCK_PARTNERS", "false");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("searches by display number but returns exact Ref_Key identity", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = decodeURIComponent(String(input)); calls.push(url);
      if (url.includes("Document_ЗаказПокупателя?")) return json({ value: [orderRow()] });
      if (url.includes("Catalog_Контрагенты?")) return json({ value: [{ Ref_Key: CUSTOMER, Description: "Pilot customer", ВидКонтрагента: "ЮридическоеЛицо" }] });
      if (url.includes("Catalog_Валюты?")) return json({ value: [{ Ref_Key: CURRENCY, Code: "MDL", Description: "Lei" }] });
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const result = await new OneCAgentCommercialProvider().searchOrders("NS-002691");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ reference: ORDER, number: "NS-002691", customerRef: CUSTOMER, organizationRef: ORGANIZATION });
    expect(calls[0]).toContain("$filter=Number eq 'NS-002691'");
    expect(calls[0]).not.toContain(`Ref_Key eq guid'${ORDER}'`);
    expect(calls).toHaveLength(3);
  });

  it("re-reads a governed exact Ref_Key when display numbers are ambiguous", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = decodeURIComponent(String(input)); calls.push(url);
      if (url.includes("Document_") && url.includes(`(guid'${ORDER}')`)) return json(orderRow());
      if (url.includes("Catalog_") && url.includes("Code,Description")) return json({ Ref_Key: CURRENCY, Code: "498", Description: "MDL" });
      if (url.includes("Catalog_") && url.includes("Ref_Key,Description")) return json({ Ref_Key: CUSTOMER, Description: "Pilot customer", ["\u0412\u0438\u0434\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430"]: "\u042e\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043a\u043e\u0435\u041b\u0438\u0446\u043e" });
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const result = await new OneCAgentCommercialProvider().searchOrders(ORDER.toUpperCase());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ reference: ORDER, number: "NS-002691", grossAmount: 8494, currency: "MDL" });
    expect(calls[0]).toContain(`(guid'${ORDER}')`);
    expect(calls[0]).not.toContain("$filter=Number eq");
    expect(calls[0]).not.toContain("Услуги");
    expect(calls).toHaveLength(3);
  });

  it("re-reads the selected Ref_Key and derives net only from explicit 1C VAT", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = decodeURIComponent(String(input));
      if (url.includes(`Document_ЗаказПокупателя(guid'${ORDER}')`)) return json({ ...orderRow(), Запасы: [{ LineNumber: 1, Номенклатура: PRODUCT, Всего: 6994, СуммаНДС: 1165.67 }], Услуги: [] });
      if (url.includes("Catalog_Контрагенты(guid'")) return json({ Ref_Key: CUSTOMER, Description: "Pilot customer", ВидКонтрагента: "ЮридическоеЛицо" });
      if (url.includes("Catalog_Валюты(guid'")) return json({ Ref_Key: CURRENCY, Code: "MDL", Description: "Lei" });
      if (url.includes("Catalog_Номенклатура?")) return json({ value: [{ Ref_Key: PRODUCT, Description: "Equipment" }] });
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const order = await new OneCAgentCommercialProvider().getOrder(ORDER);
    expect(order.lines).toEqual([{ lineRef: `${ORDER}:stock:1`, nomenclatureRef: PRODUCT, name: "Equipment", gross: 6994, vat: 1165.67, net: 5828.33 }]);
  });

  it("keeps stock and service line identities distinct when 1C reuses line numbers", async () => {
    const service = "66666666-6666-4666-8666-666666666666";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = decodeURIComponent(String(input));
      if (url.includes(`Document_ЗаказПокупателя(guid'${ORDER}')`)) return json({
        ...orderRow(),
        Запасы: [{ LineNumber: 1, Номенклатура: PRODUCT, Всего: 6994, СуммаНДС: 1165.67 }],
        Услуги: [{ LineNumber: 1, Номенклатура: service, Всего: 1500, СуммаНДС: 250 }],
      });
      if (url.includes("Catalog_Контрагенты(guid'")) return json({ Ref_Key: CUSTOMER, Description: "Pilot customer", ВидКонтрагента: "ЮридическоеЛицо" });
      if (url.includes("Catalog_Валюты(guid'")) return json({ Ref_Key: CURRENCY, Code: "MDL", Description: "Lei" });
      if (url.includes("Catalog_Номенклатура?")) return json({ value: [{ Ref_Key: PRODUCT, Description: "Equipment" }, { Ref_Key: service, Description: "Installation" }] });
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const order = await new OneCAgentCommercialProvider().getOrder(ORDER);
    expect(order.lines.map((line) => line.lineRef)).toEqual([`${ORDER}:stock:1`, `${ORDER}:service:1`]);
  });
});

function orderRow() {
  return {
    Ref_Key: ORDER, Number: "NS-002691", Date: "2026-09-20T10:00:00", Posted: true, DeletionMark: false,
    Контрагент_Key: CUSTOMER, Организация_Key: ORGANIZATION, СуммаДокумента: 8494,
    ВалютаДокумента_Key: CURRENCY, СостояниеЗаказа: "completed", СостояниеЗаказа_Type: "state", DataVersion: "v1",
  };
}
function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }
