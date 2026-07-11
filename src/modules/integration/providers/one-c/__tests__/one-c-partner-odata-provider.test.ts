import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IntegrationHttpError,
  IntegrationProviderUnavailableError,
  IntegrationTimeoutError,
  IntegrationValidationError,
} from "../../../errors";
import { ONE_C_RESOURCES } from "../one-c-odata-identifiers";
import { OneCProvider } from "../one-c-provider";

const PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const CONTRACT_ID = "22222222-2222-4222-8222-222222222222";
const PRICE_TYPE_ID = "33333333-3333-4333-8333-333333333333";
const FALLBACK_PRICE_TYPE_ID = "44444444-4444-4444-8444-444444444444";
const NON_RFC_PARTNER_ID = "18e36ea4-f68f-11f0-4393-7239d3b7bd5c";

describe("1C OData partner provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses Basic Auth without exposing credentials in failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider().partners.searchPartners({ query: "Partner" })).rejects.toBeInstanceOf(IntegrationHttpError);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from("odata-user:odata-password").toString("base64")}`,
    });
    try {
      await provider().partners.searchPartners({ query: "Partner" });
    } catch (error) {
      expect(String(error)).not.toContain("odata-password");
    }
  });

  it("maps OData v3 GUID lookup and buyer/supplier fields", async () => {
    const fetchMock = sequence(record(partnerRow()));
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider().partners.searchPartners({ query: PARTNER_ID });
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(decodeURIComponent(url.pathname)).toContain(`${ONE_C_RESOURCES.partners}(guid'${PARTNER_ID}')`);
    expect(result.items[0]).toMatchObject({ code: "000152", fullName: "Partner Company SRL", buyer: true, supplier: false });
  });

  it("maps a real non-RFC 1C counterparty GUID", async () => {
    vi.stubGlobal("fetch", sequence(record({
      ...partnerRow(),
      Ref_Key: NON_RFC_PARTNER_ID,
      Description: "NOVOTECH SYSTEMS",
    })));

    const result = await provider().partners.searchPartners({ query: NON_RFC_PARTNER_ID });

    expect(result.items).toMatchObject([{ displayName: "NOVOTECH SYSTEMS" }]);
    expect(result.items[0]?.reference.externalId).toBe(NON_RFC_PARTNER_ID);
  });

  it("searches by code before description and escapes OData strings", async () => {
    const fetchMock = sequence(collection([partnerRow()]));
    vi.stubGlobal("fetch", fetchMock);
    await provider().partners.searchPartners({ query: "A'15", limit: 1 });
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.get("$filter")).toBe("Code eq 'A''15'");
  });

  it("generates the exact UTF-8 counterparty URL without mojibake", async () => {
    const fetchMock = sequence(collection([partnerRow()]));
    vi.stubGlobal("fetch", fetchMock);

    await provider().partners.searchPartners({ query: "NOVOTECH", limit: 1 });

    const [url] = fetchMock.mock.calls[0] as [URL];
    const decodedUrl = decodeURIComponent(url.toString());
    expect(decodedUrl).toContain(ONE_C_RESOURCES.partners);
    expect(decodedUrl).toContain("НаименованиеПолное");
    expect(decodedUrl).toContain("Покупатель");
    expect(decodedUrl).not.toContain(String.fromCharCode(0x0420, 0x0459));
  });

  it("uses description substring after an empty code result", async () => {
    const fetchMock = sequence(collection([]), collection([partnerRow()]));
    vi.stubGlobal("fetch", fetchMock);
    await provider().partners.searchPartners({ query: "Partner", limit: 1 });
    const [url] = fetchMock.mock.calls[1] as [URL];
    expect(url.searchParams.get("$filter")).toBe("substringof('Partner',Description) eq true");
  });

  it("maps two real name-search rows with 1C GUID-shaped references", async () => {
    vi.stubGlobal("fetch", sequence(
      collection([]),
      collection([
        { ...partnerRow(), Ref_Key: NON_RFC_PARTNER_ID, Description: "NOVOTECH SYSTEMS" },
        { ...partnerRow(), Ref_Key: "2ce36ea4-f68f-11f0-4393-7239d3b7bd5c", Description: "NOVOTECH SYSTEMS 2" },
      ]),
    ));

    const result = await provider().partners.searchPartners({ query: "NOVOTECH", limit: 20 });

    expect(result.items).toHaveLength(2);
  });

  it("performs bounded local fiscal-code matching", async () => {
    const fetchMock = sequence(
      collection([]), collection([]),
      collection([{ ...partnerRow(), ИНН: "other" }]),
      collection([{ ...partnerRow(), ИНН: "1018600013048" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider({ partnerSearchPageSize: 1, partnerSearchMaxPages: 2 }).partners.searchPartners({ query: "1018600013048", limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [lastUrl] = fetchMock.mock.calls[3] as [URL];
    expect(lastUrl.searchParams.get("$skip")).toBe("1");
    expect(lastUrl.searchParams.get("$filter")).toBeNull();
  });

  it("includes IsFolder in every counterparty OData select", async () => {
    const fetchMock = sequence(collection([partnerRow()]));
    vi.stubGlobal("fetch", fetchMock);

    await provider().partners.searchPartners({ query: "Partner", limit: 1 });

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.get("$select")).toContain("IsFolder");
  });

  it("skips nullable folder rows and finds a valid fiscal-code match on the same page", async () => {
    const logSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const folderRow = {
      Ref_Key: "55555555-5555-4555-8555-555555555555",
      Code: null,
      Description: "Покупатели",
      НаименованиеПолное: null,
      ИНН: null,
      Покупатель: null,
      Поставщик: null,
      Недействителен: null,
      DeletionMark: false,
      IsFolder: true,
    };
    const fetchMock = sequence(collection([]), collection([]), collection([
      folderRow,
      { ...partnerRow(), Description: "NOVOTECH SYSTEMS", ИНН: "1018600013048" },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().partners.searchPartners({ query: "1018600013048" });

    expect(result.items).toMatchObject([{ displayName: "NOVOTECH SYSTEMS", taxId: "1018600013048" }]);
    expect(logSpy).toHaveBeenCalledWith({
      event: "one_c_odata_row_skipped",
      resource: "Catalog_Контрагенты",
      reason: "folder",
    });
  });

  it("skips malformed rows without failing the fiscal-code page", async () => {
    const logSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", sequence(collection([]), collection([]), collection([
      { Ref_Key: null, Description: null },
      { ...partnerRow(), ИНН: "00123456" },
    ])));

    const result = await provider().partners.searchPartners({ query: "00123456" });

    expect(result.items[0]?.taxId).toBe("00123456");
    expect(logSpy).toHaveBeenCalledWith({
      event: "one_c_odata_row_skipped",
      resource: "Catalog_Контрагенты",
      reason: "invalid_reference",
    });
  });

  it("excludes deleted and inactive counterparties", async () => {
    const logSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", sequence(collection([
      { ...partnerRow(), Ref_Key: "66666666-6666-4666-8666-666666666666", DeletionMark: true },
      { ...partnerRow(), Ref_Key: "77777777-7777-4777-8777-777777777777", Недействителен: true },
    ]), collection([])));
    await expect(provider().partners.searchPartners({ query: "Partner" })).resolves.toMatchObject({ items: [] });
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ reason: "deleted" }));
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ reason: "inactive" }));
  });

  it("loads contracts by owner and prefers counterparty price type", async () => {
    const fetchMock = sequence(collection([contractRow()]), record(priceTypeRow()));
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider().partners.fetchPartnerContracts({ partnerReference: PARTNER_ID });
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.get("$filter")).toBe(`Owner_Key eq guid'${PARTNER_ID}'`);
    expect(result.items[0]).toMatchObject({
      reference: { externalId: CONTRACT_ID },
      priceTypeReference: { externalId: PRICE_TYPE_ID },
      priceTypeSource: "counterparty",
      priceTypeName: "Distributor",
    });
  });

  it("falls back to contract price type and excludes inactive contracts", async () => {
    vi.stubGlobal("fetch", sequence(collection([
      { ...contractRow(), ВидЦенКонтрагента_Key: "00000000-0000-0000-0000-000000000000", ВидЦен_Key: FALLBACK_PRICE_TYPE_ID },
      { ...contractRow(), Ref_Key: "55555555-5555-4555-8555-555555555555", DeletionMark: true },
      { ...contractRow(), Ref_Key: "66666666-6666-4666-8666-666666666666", Недействителен: true },
    ]), record(priceTypeRow(FALLBACK_PRICE_TYPE_ID))));
    const result = await provider().partners.fetchPartnerContracts({ partnerReference: PARTNER_ID });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ priceTypeReference: { externalId: FALLBACK_PRICE_TYPE_ID }, priceTypeSource: "contract" });
  });

  it("uses bounded local contract owner fallback when Owner_Key filter is rejected", async () => {
    const fetchMock = sequence(
      new Response("{}", { status: 400 }),
      collection([{ ...contractRow(), Owner_Key: "99999999-9999-4999-8999-999999999999" }]),
      collection([contractRow()]),
      record(priceTypeRow()),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider({ partnerSearchPageSize: 1, partnerSearchMaxPages: 2 }).partners.fetchPartnerContracts({ partnerReference: PARTNER_ID });
    expect(result.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("returns null price type when neither contract field is configured", async () => {
    vi.stubGlobal("fetch", sequence(collection([{ ...contractRow(), ВидЦенКонтрагента_Key: null, ВидЦен_Key: null }])));
    const result = await provider().partners.fetchPartnerContracts({ partnerReference: PARTNER_ID });
    expect(result.items[0]?.priceTypeReference).toBeNull();
  });

  it("maps zero optional contract references to null without rejecting the contract", async () => {
    vi.stubGlobal("fetch", sequence(collection([{
      ...contractRow(),
      ВидЦенКонтрагента_Key: "00000000-0000-0000-0000-000000000000",
      ВидЦен_Key: "00000000-0000-0000-0000-000000000000",
      Организация_Key: "00000000-0000-0000-0000-000000000000",
    }])));

    const result = await provider().partners.fetchPartnerContracts({ partnerReference: PARTNER_ID });

    expect(result.items[0]).toMatchObject({
      priceTypeReference: null,
      organizationReference: null,
    });
  });

  it("looks up and lists active price types", async () => {
    const fetchMock = sequence(record(priceTypeRow()), collection([priceTypeRow(), { ...priceTypeRow(FALLBACK_PRICE_TYPE_ID), ЦеныАктуальны: false }]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().partners.fetchPriceType({ reference: PRICE_TYPE_ID })).resolves.toMatchObject({ name: "Distributor", includesVat: true });
    await expect(provider().partners.listPriceTypes()).resolves.toMatchObject({ items: [{ reference: { externalId: PRICE_TYPE_ID } }] });
  });

  it("maps timeout and malformed OData safely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("secret"), { name: "TimeoutError" })));
    await expect(provider().partners.searchPartners({ query: "Partner" })).rejects.toBeInstanceOf(IntegrationTimeoutError);

    vi.stubGlobal("fetch", sequence(new Response(JSON.stringify({ items: [] }))));
    await expect(provider().partners.searchPartners({ query: "Partner" })).rejects.toBeInstanceOf(IntegrationValidationError);
  });

  it("never falls back to mock data in real mode", async () => {
    vi.stubGlobal("fetch", sequence(new Response("{}", { status: 500 })));
    await expect(provider({ useMockPartners: false }).partners.searchPartners({ query: "Novotech Demo" })).rejects.toBeInstanceOf(IntegrationHttpError);
  });
});

function provider(overrides: Record<string, unknown> = {}): OneCProvider {
  return new OneCProvider({
    baseUrl: "https://erp-api.nsd.md/novotech/odata/standard.odata",
    username: "odata-user",
    password: "odata-password",
    requestTimeoutMs: 10000,
    partnerSearchPageSize: 50,
    partnerSearchMaxPages: 10,
    useMockPartners: false,
    ...overrides,
  });
}
function collection(value: unknown[]): Response { return new Response(JSON.stringify({ "odata.metadata": "metadata", value })); }
function record(value: unknown): Response { return new Response(JSON.stringify(value)); }
function sequence(...responses: Response[]) { return vi.fn().mockImplementation(async () => responses.shift() ?? collection([])); }
function partnerRow() { return { Ref_Key: PARTNER_ID, Code: "000152", Description: "Partner Company", НаименованиеПолное: "Partner Company SRL", ИНН: "1018600013048", Покупатель: true, Поставщик: false, Недействителен: false, DeletionMark: false }; }
function contractRow() { return { Ref_Key: CONTRACT_ID, Code: "C-001", Description: "Main contract", Owner_Key: PARTNER_ID, НомерДоговора: "001", ДатаДоговора: "2026-01-01", ВидДоговора: "Buyer", ВидЦенКонтрагента_Key: PRICE_TYPE_ID, ВидЦен_Key: FALLBACK_PRICE_TYPE_ID, Организация_Key: null, Недействителен: false, DeletionMark: false }; }
function priceTypeRow(reference = PRICE_TYPE_ID) { return { Ref_Key: reference, Code: "PT-1", Description: "Distributor", ВалютаЦены_Key: "MDL", ЦенаВключаетНДС: true, ТипВидаЦен: "Wholesale", ЦеныАктуальны: true, DeletionMark: false }; }
