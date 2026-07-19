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

function config(): OneCProviderConfig {
  return {
    providerCode: "one-c", displayName: "1C", capabilities: { catalog: true, pricing: true, inventory: true, orders: true, documents: true, finance: true, partners: true },
    baseUrl: "https://erp.example/odata", username: "u", password: "p", requestTimeoutMs: 10000,
    catalogCategoriesPath: "", catalogBrandsPath: "", catalogProductsPath: "", productPricesPath: "", stockBalancesPath: "",
    partnerSearchPageSize: 50, partnerSearchMaxPages: 10, useMockCatalog: false, useMockPricing: false, useMockInventory: false, useMockPartners: false, useLegacyMinimalOrderPayload: false,
  };
}
