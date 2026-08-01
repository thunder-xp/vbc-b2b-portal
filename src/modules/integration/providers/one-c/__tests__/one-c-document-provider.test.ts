import { afterEach, describe, expect, it, vi } from "vitest";

import { OneCProvider } from "../one-c-provider";
import { buildDocumentMetadataPageQuery, OneCDocumentODataProvider, ONE_C_DOCUMENT_SOURCES } from "../one-c-document-provider";
import { OneCODataClient } from "../one-c-odata-client";

const documentRef = "11111111-1111-1111-1111-111111111111";
const counterpartyRef = "22222222-2222-2222-2222-222222222222";
const orderRef = "33333333-3333-3333-3333-333333333333";

describe("OneCDocumentODataProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps verified delivery-note metadata and its direct customer-order relation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([row({
      Заказ: orderRef,
      Заказ_Type: "StandardODATA.Document_ЗаказПокупателя",
    })])));
    const result = await provider().fetchSourcePage(ONE_C_DOCUMENT_SOURCES[1], 0, 100);

    expect(result.items[0]).toMatchObject({
      sourceEntity: "Document_РасходнаяНакладная",
      documentType: "delivery_note",
      posted: true,
      deletionMarked: false,
      retrievalCapability: "metadata_only",
      ownerReference: { externalId: counterpartyRef, externalType: "counterparty" },
      orderReference: { externalId: orderRef, externalType: "customer-order" },
      fileName: null,
      url: null,
    });
  });

  it("rejects malformed rows independently without losing valid rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([{ ...row(), Ref_Key: "bad" }, row()])));
    const result = await provider().fetchSourcePage(ONE_C_DOCUMENT_SOURCES[2], 0, 100);
    expect(result).toMatchObject({ received: 2, rejected: 1 });
    expect(result.items).toHaveLength(1);
  });

  it("uses bounded scalar pagination and never requests binary data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(Array.from({ length: 100 }, () => row())));
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider().fetchSourcePage(ONE_C_DOCUMENT_SOURCES[0], 100, 100);
    const url = decodeURIComponent(String(fetchMock.mock.calls[0]?.[0])).replaceAll("+", " ");
    expect(url).toContain("$top=100");
    expect(url).toContain("$skip=100");
    expect(url).toContain("$format=json");
    expect(url).not.toMatch(/Base64|ФайлХранилище|Запасы/);
    expect(result.nextSkip).toBe(200);
  });

  it("uses the verified literal 1C query shape without URLSearchParams encoding", async () => {
    const query = buildDocumentMetadataPageQuery(ONE_C_DOCUMENT_SOURCES[3], 100, 100);
    expect(query).toContain("$select=Ref_Key,Number,Date");
    expect(query).toContain("НачалоПериода,КонецПериода,Статус");
    expect(query).not.toContain("Договор_Key");
    expect(query).toContain("&$top=100&$skip=100&$format=json");
    expect(query).not.toContain("%24select");
    expect(query).not.toContain("+");
  });

  it("rejects arbitrary literal query parameters", async () => {
    await expect(new OneCODataClient(config()).getLiteral(
      ONE_C_DOCUMENT_SOURCES[0].entity,
      "$select=Ref_Key&$filter=Posted eq true&$format=json",
    )).rejects.toThrow("invalid");
  });

  it("does not create a heuristic order relation from an untyped reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([row({ Заказ: orderRef, Заказ_Type: "StandardODATA.Document_ЗаказПоставщику" })])));
    const result = await provider().fetchSourcePage(ONE_C_DOCUMENT_SOURCES[1], 0, 100);
    expect(result.items[0]?.orderReference).toBeNull();
  });

  it("is wired through the production ERP provider factory path", () => {
    const documents = new OneCProvider(config()).documents;
    expect(documents).toBeInstanceOf(OneCDocumentODataProvider);
  });

  it("rejects unverified binary and print-form retrieval", async () => {
    await expect(provider().fetchDocumentFile()).rejects.toThrow("not verified");
  });
});

function provider() { return new OneCDocumentODataProvider(config()); }
function config() { return { baseUrl: "https://erp.example/odata", username: "user", password: "secret", requestTimeoutMs: 10_000 }; }
function row(extra: Record<string, unknown> = {}) { return { Ref_Key: documentRef, Number: "NS-100", Date: "2026-08-01T10:00:00", Posted: true, DeletionMark: false, Контрагент_Key: counterpartyRef, Договор_Key: null, ВалютаДокумента_Key: null, DataVersion: "v1", ...extra }; }
function json(value: unknown) { return new Response(JSON.stringify({ value }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }); }
