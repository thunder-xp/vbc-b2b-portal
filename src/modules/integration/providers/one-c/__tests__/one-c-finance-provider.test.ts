import { afterEach, describe, expect, it, vi } from "vitest";

import { OneCFinanceProvider } from "../one-c-finance-provider";
import type { OneCProviderConfig } from "../one-c-provider.config";

const counterparty = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";
const organization = "4643d461-aa49-4b70-9486-a59f80ee6af8";
const contract = "571ac1df-4ccd-11ea-93e0-000c29cf9dd4";
const currency = "cf53f667-77a3-4c69-8146-2fd58525bbfc";

describe("OneCFinanceProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the proven no-period contract Balance source and preserves the signed amount", async () => {
    const fetchMock = vi.fn<(input: URL | RequestInfo) => Promise<Response>>()
      .mockResolvedValueOnce(json({ value: [
        { Договор_Key: contract, СуммаBalance: 705425 },
        { Договор_Key: "11111111-1111-1111-1111-111111111111", СуммаBalance: 0 },
      ] }))
      .mockResolvedValueOnce(json({ value: [{
        Ref_Key: contract,
        Code: "UU-000701",
        Description: "NS-296/0302/20",
        Owner: counterparty,
        Owner_Type: "StandardODATA.Catalog_Контрагенты",
        НомерДоговора: "NS-296/0302/20",
        ВалютаРасчетов_Key: currency,
        Организация_Key: organization,
        ВидДоговора: "СПокупателем",
        DeletionMark: false,
        Недействителен: false,
      }] }))
      .mockResolvedValueOnce(json({ value: [{ Ref_Key: currency, Code: "498", Description: "MDL", DeletionMark: false }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OneCFinanceProvider(config()).fetchContractBalances({
      counterpartyReference: ref(counterparty, "counterparty"),
      organizationReference: ref(organization, "organization"),
      synchronizedAt: "2026-07-19T16:00:00.000Z",
    });

    expect(result.items).toEqual([expect.objectContaining({
      contractNumber: "NS-296/0302/20",
      currencyCode: "MDL",
      signedBalance: 705425,
    })]);
    expect(result.diagnostics).toMatchObject({ rawBalanceCount: 2, zeroBalanceCount: 1, oneCCallCount: 3 });
    const balanceUrl = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(balanceUrl).toContain("AccumulationRegister_РасчетыСПокупателями/Balance(");
    expect(balanceUrl).toContain("Dimensions='Договор'");
    expect(balanceUrl).not.toContain("Period=");
    const contractUrl = decodeURIComponent(String(fetchMock.mock.calls[1][0]));
    expect(contractUrl).toContain(`$filter=Ref_Key eq guid'${contract}'`);
    expect(contractUrl).not.toContain("$skip");
    expect(decodeURIComponent(String(fetchMock.mock.calls[2][0]))).toContain(`$filter=Ref_Key eq guid'${currency}'`);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a transient finance OData failure through the shared validated transport", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: { value: "Temporary overload" } } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(json({ value: [{ Договор_Key: contract, СуммаBalance: 12983 }] }))
      .mockResolvedValueOnce(json({ value: [contractRow(contract)] }))
      .mockResolvedValueOnce(json({ value: [{ Ref_Key: currency, Code: "498", Description: "MDL", DeletionMark: false }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OneCFinanceProvider(config(), { sleep, random: () => 0 }).fetchContractBalances({
      counterpartyReference: ref(counterparty, "counterparty"),
      organizationReference: ref(organization, "organization"),
      synchronizedAt: "2026-09-11T10:00:00.000Z",
    });

    expect(result.items).toEqual([expect.objectContaining({ signedBalance: 12983, currencyCode: "MDL" })]);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry a permanent finance OData filter failure", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response("not-an-odata-envelope", {
      status: 400,
      headers: { "content-type": "text/plain" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OneCFinanceProvider(config(), { sleep }).fetchContractBalances({
      counterpartyReference: ref(counterparty, "counterparty"),
      organizationReference: ref(organization, "organization"),
      synchronizedAt: "2026-09-11T10:00:00.000Z",
    })).rejects.toMatchObject({ name: "OneCODataFilterUnsupportedError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("excludes deleted contracts instead of publishing stale contract identity", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ value: [{ Договор_Key: contract, СуммаBalance: -12000 }] }))
      .mockResolvedValueOnce(json({ value: [{ Ref_Key: contract, Owner: counterparty, Owner_Type: "StandardODATA.Catalog_Контрагенты", Организация_Key: organization, ВидДоговора: "СПокупателем", ВалютаРасчетов_Key: currency, DeletionMark: true, Недействителен: false }] }))
      .mockResolvedValueOnce(json({ value: [{ Ref_Key: currency, Code: "498", Description: "MDL", DeletionMark: false }] })));
    const result = await new OneCFinanceProvider(config()).fetchContractBalances({
      counterpartyReference: ref(counterparty, "counterparty"),
      organizationReference: ref(organization, "organization"),
      synchronizedAt: "2026-07-19T16:00:00.000Z",
    });
    expect(result.items).toEqual([]);
    expect(result.diagnostics?.deletedContractCount).toBe(1);
  });

  it("batch-resolves repeated contract and currency references without N+1 calls", async () => {
    const contract2 = "22222222-2222-2222-2222-222222222222";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ value: [{ Договор_Key: contract, СуммаBalance: 100 }, { Договор_Key: contract2, СуммаBalance: -20 }] }))
      .mockResolvedValueOnce(json({ value: [contractRow(contract), contractRow(contract2)] }))
      .mockResolvedValueOnce(json({ value: [{ Ref_Key: currency, Code: "498", Description: "MDL", DeletionMark: false }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OneCFinanceProvider(config()).fetchContractBalances({ counterpartyReference: ref(counterparty, "counterparty"), organizationReference: ref(organization, "organization"), synchronizedAt: new Date().toISOString() });
    expect(result.items).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.diagnostics?.oneCCallCount).toBe(3);
  });

  it("batch-loads payment obligations and excludes unposted or deleted payment allocations", async () => {
    const order = "33333333-3333-4333-8333-333333333333";
    const postedPayment = "44444444-4444-4444-8444-444444444444";
    const ignoredPayment = "55555555-5555-4555-8555-555555555555";
    const fetchMock = vi.fn<(input: URL | RequestInfo) => Promise<Response>>().mockImplementation(async (input) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("Document_ЗаказПокупателя?")) return json({ value: [{
        Ref_Key: order, DataVersion: "order-v1", Number: "CO-100", Date: "2026-09-01T00:00:00",
        DeletionMark: false, Posted: true, БанковскийСчет_Key: "00000000-0000-0000-0000-000000000000",
        ВалютаДокумента_Key: currency, ДатаИзменения: "2026-09-05T08:00:00", Договор_Key: contract,
        ЗапланироватьОплату: true, Контрагент_Key: counterparty, Организация_Key: organization,
        СуммаДокумента: 2366, ТипДенежныхСредств: "Безналичные", СостояниеЗаказа_Key: "accepted",
        ПлатежныйКалендарь: [{ LineNumber: 1, ДатаОплаты: "2026-09-09T00:00:00", ПроцентОплаты: 100, СуммаОплаты: 2366, СуммаНДСОплаты: 394.33 }],
      }] });
      if (url.includes("Document_ПоступлениеНаСчет?")) return json({ value: [
        payment(postedPayment, order, 615.6, true, false),
        payment(ignoredPayment, order, 500, false, false),
      ] });
      if (url.includes("Document_ПоступлениеВКассу?")) return json({ value: [payment(crypto.randomUUID(), order, 250, true, true)] });
      if (url.includes("Dimensions='Договор,Заказ'")) return json({ value: [{ Заказ: order, Заказ_Type: "StandardODATA.Document_ЗаказПокупателя", СуммаBalance: 1750.4 }] });
      if (url.includes("Catalog_ДоговорыКонтрагентов?")) return json({ value: [contractRow(contract)] });
      if (url.includes("Catalog_Валюты?")) return json({ value: [{ Ref_Key: currency, Code: "498", Description: "MDL", DeletionMark: false }] });
      throw new Error(`Unexpected test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OneCFinanceProvider(config()).fetchPaymentObligations({
      counterpartyReference: ref(counterparty, "counterparty"),
      organizationReference: ref(organization, "organization"),
      synchronizedAt: "2026-09-06T08:00:00.000Z",
    });

    expect(result.items).toEqual([expect.objectContaining({
      orderNumber: "CO-100", sourceOrderDataVersion: "order-v1", paidAmount: 615.6,
      remainingAmount: 1750.4, latestPaymentAt: "2026-09-05T07:00:00.000Z",
      calendarRows: [{ lineNumber: 1, dueDate: "2026-09-09", paymentPercent: 100, plannedAmount: 2366, vatAmount: 394.33 }],
    })]);
    expect(result.items[0]?.allocations).toEqual([expect.objectContaining({ paymentType: "bank", posted: true, deletionMarked: false, settlementAmount: 615.6 })]);
    expect(result.diagnostics).toMatchObject({ ordersReceived: 1, bankPaymentsReceived: 2, cashPaymentsReceived: 1, oneCCallCount: 6 });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    const orderRequest = fetchMock.mock.calls.map(([input]) => decodeURIComponent(String(input)))
      .find((url) => url.includes("Document_ЗаказПокупателя?"));
    expect(orderRequest).toContain("ЗапланироватьОплату eq true");
    expect(orderRequest).toContain("СостояниеЗаказа,СостояниеЗаказа_Type");
    expect(orderRequest).not.toContain("СостояниеЗаказа_Key");
  });

  it("does not infer settlement when the authoritative order balance is absent", async () => {
    const order = "33333333-3333-4333-8333-333333333333";
    const fetchMock = vi.fn<(input: URL | RequestInfo) => Promise<Response>>().mockImplementation(async (input) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("Document_ЗаказПокупателя?")) return json({ value: [{
        Ref_Key: order, DataVersion: "v", Number: "CO-101", Date: "2026-09-01T00:00:00", DeletionMark: false, Posted: true,
        БанковскийСчет_Key: "00000000-0000-0000-0000-000000000000", ВалютаДокумента_Key: currency,
        Договор_Key: contract, Контрагент_Key: counterparty, Организация_Key: organization,
        ПлатежныйКалендарь: [{ LineNumber: 1, ДатаОплаты: "2026-09-09T00:00:00", ПроцентОплаты: 100, СуммаОплаты: 100, СуммаНДСОплаты: 16.67 }],
      }] });
      if (url.includes("Document_ПоступлениеНаСчет?")) return json({ value: [payment(crypto.randomUUID(), order, 100, true, false)] });
      if (url.includes("Document_ПоступлениеВКассу?") || url.includes("Dimensions='Договор,Заказ'")) return json({ value: [] });
      if (url.includes("Catalog_ДоговорыКонтрагентов?")) return json({ value: [contractRow(contract)] });
      if (url.includes("Catalog_Валюты?")) return json({ value: [{ Ref_Key: currency, Code: "498", Description: "MDL", DeletionMark: false }] });
      throw new Error(`Unexpected test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OneCFinanceProvider(config()).fetchPaymentObligations({ counterpartyReference: ref(counterparty, "counterparty"), organizationReference: ref(organization, "organization"), synchronizedAt: "2026-09-06T08:00:00Z" });
    expect(result.items[0]).toMatchObject({ paidAmount: 100, remainingAmount: null });
  });
});

function json(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

function ref(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}

function contractRow(reference: string) {
  return { Ref_Key: reference, Code: "C", Description: "Contract", Owner: counterparty, Owner_Type: "StandardODATA.Catalog_Контрагенты", НомерДоговора: "C", ВалютаРасчетов_Key: currency, Организация_Key: organization, ВидДоговора: "СПокупателем", DeletionMark: false, Недействителен: false };
}

function payment(reference: string, order: string, amount: number, posted: boolean, deletionMark: boolean) {
  return {
    Ref_Key: reference, DataVersion: "payment-v1", Date: "2026-09-05T10:00:00", Posted: posted, DeletionMark: deletionMark,
    РасшифровкаПлатежа: [{ Заказ: order, Заказ_Type: "StandardODATA.Document_ЗаказПокупателя", СуммаРасчетов: amount }],
  };
}

function config(): OneCProviderConfig {
  return {
    providerCode: "one-c", displayName: "1C", capabilities: { catalog: true, pricing: true, inventory: true, orders: true, documents: true, finance: true, partners: true },
    baseUrl: "https://erp.example/odata", username: "u", password: "p", requestTimeoutMs: 10000,
    catalogCategoriesPath: "", catalogBrandsPath: "", catalogProductsPath: "", productPricesPath: "", stockBalancesPath: "",
    partnerSearchPageSize: 50, partnerSearchMaxPages: 10, useMockCatalog: false, useMockPricing: false, useMockInventory: false, useMockPartners: false, useLegacyMinimalOrderPayload: false,
  };
}
